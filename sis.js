const config = require("./lib/config");
const express = require("express");
const morgan = require("morgan");
const catchError = require('./lib/catch-error');
const session = require("express-session");
const store = require("connect-loki");
const PgPersistance = require('./lib/pg-persistance');
const flash = require("express-flash");

const { query, body, validationResult } = require("express-validator");


const app = express();
const host = config.HOST;
const port = config.PORT;
const LokiStore = store(session);

// Detect unauthorized access to routes
const requiresAuthentication = (req, res, next) => {
  if (!res.locals.signedIn) {
    req.session.originalURL = req.originalUrl;
    res.redirect(302, "/users/login")
  } else {
    next();
  }
}

// Verify that the currently logged in user is the teacher of the course or an admin
const verifyCourseTeacherOrAdmin = async (req, res, next) => {
  let store = res.locals.store;
  if (res.locals.role === 'administrator') {
    next();
  } else {
    let expectedTeacherID = await store.verifyTeacher(+req.params.courseID, res.locals.userID);
    if (!expectedTeacherID) {
      let err = new Error("You do not have permission to do this");
      next(err);
    } else {
      next();
    }
  }
}

//verify that the currently logged in user is an admin
const verifyAdmin = async (req, res, next) => {
  let role = res.locals.role;

  if (role !== "administrator") {
    let err = new Error("You do not have permission to do this");
    next(err);
  } else {
    next();
  }
}

app.set("views", "./views");
app.set("view engine", "pug");
app.use(flash());
app.use(express.static("public"));

app.use(morgan("common"));
app.use(express.urlencoded({ extended: false }));

app.use(session({
  cookie: {
    httpOnly: true,
    maxAge: 31 * 24 * 60 * 60 * 1000, // 31 days in milliseconds
    path: "/",
    secure: false,
  },
  name: "graham-sis-session-id",
  resave: false,
  saveUninitialized: true,
  secret: config.SECRET,
  store: new LokiStore({}),
}));

// Extract session info
app.use((req, res, next) => {
  res.locals.flash = req.session.flash;
  res.locals.username = req.session.username;
  res.locals.signedIn = req.session.signedIn;
  res.locals.userID = req.session.userID;
  res.locals.fullName = req.session.fullName;
  res.locals.role = req.session.role;
  res.locals.store = new PgPersistance(req.session);
  delete req.session.flash;
  next();
});

app.get("/",
  requiresAuthentication,
  catchError(async (req, res) => {
    let store = res.locals.store;
    let role = res.locals.role;
    let page = +req.query.page || 1;

    req.session.flash = res.locals.flash;
    if (role === 'teacher') {
      res.redirect(`/teacher`);
    } else if (role === 'administrator') {
      res.redirect(`/admin?page=${page}`);
    } else if (role === 'student') {
      res.redirect(`/student/${res.locals.userID}`);
    } else {
      throw new Error("Invalid role.");
    }
  }));

app.get("/admin",
  requiresAuthentication,
  verifyAdmin,
  catchError(async (req, res) => {
    let store = res.locals.store;

    let paginationData = {
      page: +req.query.page || 1,
      limit: +config.ENTRIES_PER_PAGE,
    }



    paginationData.offset = (paginationData.page - 1) * paginationData.limit;
    let classList = await store.getClassList(paginationData.limit, paginationData.offset);
    paginationData.courseCount = +(await store.getClassesCount());

    paginationData.numberPages = Math.ceil(paginationData.courseCount / paginationData.limit);

    res.render('admin-course-list', {
      paginationData,
      classList,
    })
  }));

app.get("/admin/course/:courseID",
  requiresAuthentication,
  verifyAdmin,
  catchError(async (req, res) => {
    let store = res.locals.store;
    let courseID = +req.params.courseID;
    let classInfo = await store.getClassInfo(courseID);
    let paginationData = {
      page: +req.query.page || 1,
      limit: +config.ENTRIES_PER_PAGE,
    }
    paginationData.totalStudents = await store.getRosterCountAdmin(courseID);

    if (paginationData.totalStudents > 0) {
      paginationData.numberPages = Math.ceil(paginationData.totalStudents / paginationData.limit);
    } else {
      paginationData.numberPages = 1;
    }

    if (paginationData.numberPages < paginationData.page) {
      paginationData.page = paginationData.numberPages;
    }

    paginationData.offset = (paginationData.page - 1) * paginationData.limit;

    var roster = await store.getClassRosterAdmin(courseID, paginationData.limit, paginationData.offset);

    res.render("admin-class-roster", {
      courseID,
      paginationData,
      roster,
      classInfo
    })
  }));

app.post("/admin/course/:courseID/update",
  requiresAuthentication,
  verifyAdmin,
  [
    body("newCourseName")
      .trim()
      .notEmpty()
      .withMessage("Please enter a new course name")
      .bail()
      .isAlphanumeric("en-US", { ignore: " -'" })
      .withMessage("Only numbers and letters are allowed")
  ],
  catchError(async (req, res) => {
    let store = res.locals.store;
    let courseID = +req.params.courseID;
    let newCourseName = req.body.newCourseName;

    let errors = validationResult(req);
    if (!errors.isEmpty()) {
      errors.array().forEach(message => req.flash("error", message.msg));
    } else {
      let updateCourse = await store.updateCourseName(courseID, newCourseName)
      req.flash("success", "Course renamed");
    }

    res.redirect(`/admin/course/${courseID}`);
  }));

app.get("/admin/add-course",
  requiresAuthentication,
  verifyAdmin,
  catchError(async (req, res) => {
    let currentTeachers = await res.locals.store.getTeacherList()
    res.render("add-course", {
      currentTeachers
    })
  }));

app.post("/admin/add-course",
  requiresAuthentication,
  verifyAdmin,
  [
    body()
      .custom((_, { req }) => {
        return (req.body.username && req.body.fullName) || req.body.current_teacher;
      })
      .withMessage("Please create a new user or select an existing teacher")
      .bail(),
    body("period")
      .isInt({ min: 1, max: 8 })
      .withMessage("That is not a valid period"),
    body("username")
      .trim()
      .if(body("current_teacher").not().exists({ checkFalsy: true }))
      .isAlphanumeric()
      .withMessage("Only numbers and letters are allowed")
      .bail(),
    body("fullName")
      .trim()
      .if(body("current_teacher").not().exists({ checkFalsy: true }))
      .isAlpha("en-US", { ignore: " -'" })
      .withMessage("That is not a valid name"),
    body("course_name")
      .trim()
      .notEmpty()
      .withMessage("All fields are required")
      .bail()
      .isAlphanumeric("en-US", { ignore: " -'" })
      .withMessage("That is not a valid name"),
  ],
  catchError(async (req, res) => {
    let store = res.locals.store;

    let courseName = req.body.course_name;
    let period = +req.body.period;
    let currentTeacherID = req.body.current_teacher;
    let newUsername = req.body.username;
    let newFullName = req.body.fullName;

    let errors = validationResult(req);
    if (!errors.isEmpty()) {
      errors.array().forEach(message => req.flash("error", message.msg));
      let currentTeachers = await res.locals.store.getTeacherList()
      res.render("add-course", {
        currentTeachers,
        period,
        newUsername,
        newFullName,
        course_name: courseName,
        flash: req.flash()
      });
    } else {

      if (currentTeacherID) {
        let teacherIsFree = await store.isTeacherAvailable(currentTeacherID, period);

        if (!teacherIsFree) {
          let currentTeachers = await res.locals.store.getTeacherList()
          req.flash("error", "That teacher is not available that period")
          res.render("add-course", {
            currentTeachers,
            period,
            course_name: courseName,
            flash: req.flash()
          });
        } else {
          let newCourseID = await store.createCourse(currentTeacherID, courseName, period);
          req.flash("success", "Course created");
          res.redirect(`/admin/course/${newCourseID}`)
        }
      } else {
        let existingUserID = await store.getUserID(newUsername);
        if (existingUserID !== -1) {
          req.flash("error", "That username is already taken");
          let currentTeachers = await res.locals.store.getTeacherList()
          res.render("add-course", {
            currentTeachers,
            newFullName,
            course_name: courseName,
            period,
            flash: req.flash()
          });
        } else {
          let newTeacherID = await store.createTeacher(newUsername, newFullName);
          let newCourseID = await store.createCourse(newTeacherID, courseName, period);
          req.flash("success", "Course created");
          res.redirect(`/admin/course/${newCourseID}`)
        }
      }
    }
  }));

app.get("/teacher",
  requiresAuthentication,
  catchError(async (req, res) => {
    let store = res.locals.store;
    let currentPeriod = +req.query.period;

    if (res.locals.role !== 'teacher') throw new Error("You do not have permission to access this page");

    let teacherSchedule = await store.getTeacherSchedule(res.locals.userID);
    //render the teacher schedule until a period is selected
    if (!currentPeriod) {
      res.render("teacher-schedule", {
        teacherSchedule
      });
    } else {
      //pagination information
      let paginationData = {
        page: +req.query.page || 1,
        limit: +config.ENTRIES_PER_PAGE,
      }
      let courseID = await store.getCourseID(res.locals.userID, currentPeriod);
      paginationData.totalStudents = await store.getRosterCount(res.locals.userID, currentPeriod);

      if (paginationData.totalStudents > 0) {
        paginationData.numberPages = Math.ceil(paginationData.totalStudents / paginationData.limit);
      } else {
        paginationData.numberPages = 1;
      }

      if (paginationData.numberPages < paginationData.page) {
        paginationData.page = paginationData.numberPages;
      }

      paginationData.offset = (paginationData.page - 1) * paginationData.limit;

      let classInfo = await store.getClassInfo(courseID);

      let roster = await store.getClassRoster(res.locals.userID, currentPeriod, paginationData.limit, paginationData.offset);

      res.render("teacher-roster", {
        courseID,
        classInfo,
        currentPeriod,
        roster,
        paginationData,
        teacherSchedule
      });
    }
  }));

app.get("/course/:courseID/add-student",
  requiresAuthentication,
  verifyCourseTeacherOrAdmin,
  (req, res) => {
    let courseID = req.params.courseID;
    let period = +req.query.period || 1;

    res.render("add-student", {
      courseID,
      period
    })
  });

app.post("/course/:courseID/add-student",
  requiresAuthentication,
  verifyCourseTeacherOrAdmin,
  [
    body("period")
      .isInt({ min: 1, max: 8 })
      .withMessage("That is not a valid period"),
    body("username")
      .trim()
      .notEmpty()
      .withMessage("All fields are required")
      .bail()
      .isAlphanumeric()
      .withMessage("Only numbers and letters are allowed"),
    body("studentname")
      .trim()
      .notEmpty()
      .withMessage("All fields are required")
      .bail()
      .isAlpha("en-US", { ignore: " -'" })
      .withMessage("That is not a valid name"),
    body("gradelevel")
      .isInt({ min: 9, max: 12 })
      .withMessage("That is not a valid grade")
      .bail()
      .notEmpty()
      .withMessage("All fields are required"),
    body("grade")
      .notEmpty()
      .withMessage("All fields are required")
      .isDecimal({ decimal_digits: '0,1' })
      .withMessage("That is not a valid grade")
      .bail()
      .isFloat({ min: 0, max: 100 })
      .withMessage("That is not a valid grade")
  ],
  catchError(async (req, res) => {
    let store = res.locals.store;
    let courseID = +req.params.courseID;
    let period = +req.body.period;
    let username = req.body.username;
    let studentName = req.body.studentname;
    let gradeLevel = +req.body.gradelevel;
    let grade = +req.body.grade;

    let errors = validationResult(req);
    if (!errors.isEmpty()) {
      errors.array().forEach(message => req.flash("error", message.msg));
      res.render("add-student", {
        studentName,
        gradeLevel,
        grade,
        courseID,
        period,
        flash: req.flash()
      });
    } else {

      let existingUserID = await store.getUserID(username);
      if (existingUserID !== -1) {
        req.flash("error", "That username is already taken");
        res.render("add-student", {
          studentName,
          gradeLevel,
          grade,
          courseID,
          period,
          flash: req.flash()
        });
      } else {

        let createdStudent = await store.createNewStudent(username, studentName, gradeLevel, grade, courseID);
        req.flash("success", `${studentName} added to your class`)
        if (res.locals.role === 'teacher') {
          res.redirect(`/teacher?period=${period}`);
        } else if (res.locals.role === 'administrator') {
          res.redirect(`/admin/course/${courseID}`);
        }
      }
    }
  }));

app.get("/student/:userID",
  requiresAuthentication,
  catchError(async (req, res) => {
    let store = res.locals.store;
    let userID = +req.params.userID;

    let currentUserRole = res.locals.role;
    let schedule = await store.getStudentClasses(userID)
    //teachers can view all student schedules without grades
    //students can only view their own schedules
    let showGrades = true;
    if (currentUserRole === 'teacher') {
      showGrades = false;
    } else if (currentUserRole === 'administrator') {
      showGrades = true;
    } else if (currentUserRole === 'student') {
      if (res.locals.userID === userID) {
        showGrades = true;
      } else {
        throw new Error("You do not have permission to view this page");
      }
    } else {
      throw new Error("You do not have permission to view this page");
    }

    let studentName = schedule[0].studentname;
    let studentGradeLevel = schedule[0].gradelevel;

    res.render("student-schedule", {
      schedule,
      studentName,
      studentGradeLevel,
      showGrades
    });
  }));

app.post("/course/:courseID/student/:studentID/grade",
  requiresAuthentication,
  verifyCourseTeacherOrAdmin,
  [
    body("grade")
      .isDecimal({ decimal_digits: '0,1' })
      .withMessage("That is not a valid grade")
      .bail()
      .isFloat({ min: 0, max: 100 })
      .withMessage("That is not a valid grade")
  ],
  catchError(async (req, res) => {
    let store = res.locals.store;
    let newGrade = +req.body.grade;
    let studentID = +req.params.studentID;
    let courseID = +req.params.courseID;
    let period = +req.body.period;
    let currentPage = +req.body.page;

    let errors = validationResult(req);
    if (!errors.isEmpty()) {
      errors.array().forEach(message => req.flash("error", message.msg));
    } else {
      let updatedGrade = await store.updateGrade(courseID, studentID, newGrade);

      if (updatedGrade) {
        req.flash("success", "Grade updated");
      } else {
        req.flash("error", "An error occurred");
      }
    }
    if (res.locals.role === 'teacher') {
      res.redirect(`/teacher?period=${period}&page=${currentPage}`);
    } else if (res.locals.role === 'administrator') {
      res.redirect(`/admin/course/${courseID}?page=${currentPage}`);
    }
  }));

app.post("/course/:courseID/student/:studentID/drop",
  requiresAuthentication,
  verifyCourseTeacherOrAdmin,
  catchError(async (req, res) => {
    let store = res.locals.store;
    let courseID = req.params.courseID;
    let studentID = req.params.studentID;
    let currentPeriod = +req.body.period || 0;
    let page = +req.body.page;

    let successfulDrop = store.dropStudent(courseID, studentID);
    let studentName = store.getStudentName(studentID);

    let resultsBoth = await Promise.all([successfulDrop, studentName]);

    if (resultsBoth[0]) {
      req.flash("success", `You have dropped ${resultsBoth[1]}`);
    } else {
      req.flash("error", "There was a problem");
    }

    if (res.locals.role === 'teacher') {
      res.redirect(`/teacher?period=${currentPeriod}&page=${page}`);
    } else if (res.locals.role === 'administrator') {
      res.redirect(`/admin/course/${courseID}?page=${page}`)
    }

  }));

app.get("/course/:courseID/drop-course",
  requiresAuthentication,
  verifyCourseTeacherOrAdmin,
  catchError(async (req, res) => {
    let store = res.locals.store;
    let courseID = +req.params.courseID;

    let page = +req.query.page;

    let courseDropped = await store.dropCourse(courseID);

    if (!courseDropped) {
      req.flash("error", "There was a problem");
    } else {
      req.flash("success", "Course dropped");
    }
    res.redirect(`/?page=${page}`);
  }));

app.get("/users/login", (req, res) => {
  let originalURL = req.session.originalURL || "/";

  if(req.session.originalURL) {
    delete req.session.originalURL
  }

  res.render("login", {
    originalURL
  });
});

app.post("/users/login", catchError(async (req, res) => {
  let store = res.locals.store;
  let username = req.body.username;
  let password = req.body.password;
  let validLogin = await store.authenticate(username, password);
  let originalURL = req.body.originalURL;

  if (!validLogin[0]) {
    req.flash("error", "Invalid credentials");
    res.render("login", {
      username,
      flash: req.flash(),
      originalURL
    });
  } else {
    let fullNamePromise = store.getFullName(username);
    let rolePromise = store.getRole(+validLogin[1]);

    let resultBoth = await Promise.all([fullNamePromise, rolePromise]);
    let [fullName, role] = [resultBoth[0], resultBoth[1]]

    req.flash("success", "You are signed in.")
    req.session.signedIn = true;
    req.session.username = username;
    req.session.userID = +validLogin[1];
    req.session.fullName = fullName;
    req.session.role = role;
    res.redirect(originalURL);
  }
}));

app.post("/users/logout", (req, res) => {
  delete req.session.signedIn;
  delete req.session.username;
  delete req.session.userID;
  delete req.session.fullName;
  res.redirect("/");
});


//catch-all for get requests
app.get("*",
  requiresAuthentication,
  (req, res) => {
    res.redirect("/");
  });

//catch-all for post requests  
app.post("*",
  requiresAuthentication,
  (req, res) => {
    res.redirect("/");
  });


// Error handler
app.use((err, req, res, _next) => {
  console.log(err); // Writes more extensive information to the console log
  res.status(404).send(err.message);
});

app.listen(port, host, () => {
  console.log(`Graham-sis is listening on port ${port} of ${host}`);
})