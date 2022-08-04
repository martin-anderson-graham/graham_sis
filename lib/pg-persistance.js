const { dbQuery } = require('./db-query');
const bcrypt = require('bcrypt');

class PgPersistance {

  async authenticate(user, pass) {
    let SQL = `
      SELECT password, id FROM users
       WHERE username = $1
    `;

    let result = await dbQuery(SQL, user);

    if (result.rowCount === 0) return [false, 0];

    let validLogin = await bcrypt.compare(pass, result.rows[0].password);

    return [validLogin, result.rows[0].id];
  }

  async getStudentName(studentID) {
    let SQL = `
      SELECT name FROM students
       WHERE id = $1
    `;

    let result = await dbQuery(SQL, studentID);

    if(result.rowCount !== 1) {
      throw new Error("An error occurred");
    } else {
      return result.rows[0].name;
    }
  }

  async getCourseID(userID, period) {
    let SQL = `
      SELECT c.id FROM courses AS c
        JOIN teachers AS t
          ON t.id = c.teacher_id
        JOIN users AS u
          ON u.id = t.user_id
       WHERE u.id = $1 AND c.period = $2
    `;

    let result = await dbQuery(SQL, userID, period);

    if(result.rowCount > 0) {
      return result.rows[0].id;
    } else {
      throw new Error("Course not found");
    }
  }

  async getFullName(username) {
    let SQL = `
    SELECT s.name AS sname, t.name AS tname, a.name AS aname FROM users AS u
    FULL JOIN students AS s
      ON s.user_id = u.id
    FULL JOIN teachers AS t
      ON t.user_id = u.id
    FULL JOIN admin AS a
      ON a.user_id = u.id
   WHERE u.username = $1
    `;
     let result = await dbQuery(SQL, username);
     if(result.rowCount > 0) {
       let name = result.rows[0].sname || result.rows[0].tname || result.rows[0].aname;
       return name;
     } else {
       return "";
     }
  }

  async getRole(uID) {
    let SQL = `
      SELECT role FROM users
       WHERE id = $1
    `;

    let result = await dbQuery(SQL, uID);

    if (result.rowCount !== 1) throw new Error("Not a valid teacher");

    return result.rows[0].role;

  };

  async _verifyCourseExists(courseID) {
    let SQL = `
      SELECT name FROM courses
       WHERE id = $1;
    `;

    let result = await dbQuery(SQL, courseID);

    return result.rowCount !== 0;
  }

  async getClassRoster(uID, period, limit, offset) {
    let SQL = `
      SELECT s.user_id AS userid, s.name, g.grade, c.name AS coursename, c.id AS course_id, s.id AS student_id, s.grade AS gradelevel
        FROM users AS u
        JOIN teachers AS t
          ON t.user_id = u.id
        JOIN courses AS c
          ON c.teacher_id = t.id
        JOIN students_courses AS g
          ON c.id = g.course_id
        JOIN students AS s
          ON g.student_id = s.id
       WHERE c.period = $2 AND u.id = $1
       ORDER BY lower(s.name) ASC
       LIMIT $3 OFFSET $4
    `;

    let result = await dbQuery(SQL, uID, period, limit, offset);

    return result.rows;
  }

  async getClassRosterAdmin(courseID, limit, offset) {
    let SQL = `
    SELECT s.name, g.grade, c.name AS coursename, c.id AS course_id, s.id AS student_id, s.user_id AS user_id, s.grade AS gradelevel
      FROM users AS u
      JOIN teachers AS t
        ON t.user_id = u.id
      JOIN courses AS c
        ON c.teacher_id = t.id
      JOIN students_courses AS g
        ON c.id = g.course_id
      JOIN students AS s
        ON g.student_id = s.id
     WHERE c.id = $1
     ORDER BY lower(s.name) ASC
     LIMIT $2 OFFSET $3
  `;

  let courseExists = await this._verifyCourseExists(courseID);

  if(!courseExists) throw new Error("That course does not exist");

  let result = await dbQuery(SQL, courseID, limit, offset);

  return result.rows;
  }

  async getClassInfo(courseID) {
    let SQL = `
      SELECT c.name AS courseName, t.name AS teacherName FROM courses AS c
        JOIN teachers AS t
          ON c.teacher_id = t.id
       WHERE c.id = $1
    `;

    let result = await dbQuery(SQL, courseID);

    if(result.rowCount === 0) throw new Error("Course not found");

    return result.rows[0];
  }

  async getRosterCount(uID, period) {
    let SQL = `
    SELECT count(g.student_id) FROM users AS u
      JOIN teachers AS t
        ON t.user_id = u.id
      JOIN courses AS c
        ON c.teacher_id = t.id
      JOIN students_courses AS g
        ON c.id = g.course_id
     WHERE c.period = $2 AND u.id = $1
  `;

    let result = await dbQuery(SQL, uID, period);

    if(result.rowCount === 0) return 0;

    return result.rows[0].count;
  }

  async getRosterCountAdmin(courseID) {
    let SQL = `
    SELECT student_id FROM students_courses
     WHERE course_id = $1
  `;

    let result = await dbQuery(SQL, courseID);

    return result.rowCount;
  }

  async getStudentID(uID) {
    let SQL = `
      SELECT s.id AS student_id FROM students AS s
        JOIN users AS u
          ON u.id = s.user_id
       WHERE u.id = $1
    `;

    let result = await dbQuery(SQL, uID);

    if (result.rowCount === 0) throw new Error("That student does not exist");

    return result.rows[0].student_id;
  }

  async getTeacherID(uID) {
    let SQL = `
    SELECT t.id AS teacher_id FROM teachers AS t
      JOIN users AS u
        ON u.id = t.user_id
     WHERE u.id = $1
  `;

  let result = await dbQuery(SQL, uID);

  if (result.rowCount === 0) throw new Error("That teacher does not exist");

  return result.rows[0].teacher_id;
  }

  async getStudentClasses(uID) {
    let SQL = `
      SELECT s.name AS studentname, s.grade as gradelevel, c.period, c.name as coursename, t.name as teachername, g.grade FROM courses AS c
        JOIN students_courses AS g
          ON c.id = g.course_id
        JOIN students AS s
          ON s.id = g.student_id
        JOIN teachers AS t
          ON c.teacher_id = t.id
       WHERE s.user_id = $1
       ORDER BY c.period ASC
    `;

    let result = await dbQuery(SQL, uID);

    if(result.rowCount === 0) throw new Error("That is not a student");

    return result.rows;
  }

  async updateGrade(courseID, studentID, newGrade) {
    let SQL = `
      UPDATE students_courses
         SET grade = $3
       WHERE student_id = $2 AND course_id = $1
    `;

    let result = await dbQuery(SQL, courseID, studentID, newGrade);
    
    return result.rowCount > 0;
  }

  async verifyTeacher(courseID, userID) {
    let SQL = `
      SELECT u.id FROM courses AS c
       JOIN teachers AS t
         ON t.id = c.teacher_id
       JOIN users AS u
         ON t.user_id = u.id
       WHERE c.id = $1    
    `;

    let result = await dbQuery(SQL, courseID);

    if(result.rowCount === 0) throw new Error("Course not found");

    return result.rows[0].id === userID;
  }

  async getTeacherSchedule(uID) {
    let SQL = `
      SELECT c.name, c.period FROM courses AS c
        JOIN teachers AS t
          ON t.id = c.teacher_id
       WHERE t.user_id = $1
       ORDER BY c.period ASC
    `;

    let result = await dbQuery(SQL, uID);

    return result.rows;
  }

  async dropStudent(courseID, studentID) {
    let SQL = `
      DELETE FROM students_courses 
       WHERE course_id = $1 AND student_id = $2
    `;

    let result = await dbQuery(SQL, courseID, studentID);

    return result.rowCount > 0;
  }

  async getUserID(username) {
    let SQL = `
      SELECT id FROM users
       WHERE username = $1
    `;

    let result = await dbQuery(SQL, username);

    if(result.rowCount === 0) {
      return -1
    }

    return result.rows[0].id;
  }

  async _createUser(username, role) {
    const hashedPassword = await bcrypt.hash(username, 2);
    const CREATE_USER_SQL = `
      INSERT INTO users (username, password, role)
      VALUES ($1, $2, $3)
    `;
  
    let result = await dbQuery(CREATE_USER_SQL, username, hashedPassword, role);
    
    if(result.rowCount === 0) throw new Error("Something went wrong");
    
    let getIDResult = await this.getUserID(username);
    
    return getIDResult;
  }

  async _createStudent(userID, name, grade) {
    let SQL = `
      INSERT INTO students (user_id, name, grade)
      VALUES ($1, $2, $3)
    `;

    let result = await dbQuery(SQL, userID, name, grade);

    if(result.rowCount === 0) throw new Error("Something went wrong");

    const STUDENT_ID_SQL = `
      SELECT id FROM students
       WHERE user_id = $1
    `;

    let queryStudentID = await dbQuery(STUDENT_ID_SQL, userID);

    if(queryStudentID.rowCount === 0) throw new Error("Something went wrong");

    return queryStudentID.rows[0].id;
  }

  async _addStudentToCourse(studentID, courseID, grade) {
    let SQL = `
      INSERT INTO students_courses (student_id, course_id, grade)
      VALUES ($1, $2, $3)
    `;

    let result = await dbQuery(SQL, studentID, courseID, grade);

    if(result.rowCount === 0) throw new Error("Something went wrong");

    return true;
  }

  async createNewStudent(username, fullName, gradeLevel, grade, courseID) {

    let newUserID = await this._createUser(username, 'student');
    let newStudentID = await this._createStudent(newUserID, fullName, gradeLevel);

    let result = await this._addStudentToCourse(newStudentID, courseID, grade);

    return result;
  }

  async createTeacher(username, name) {
    let newUserID = await this._createUser(username, 'teacher');

    let SQL = `
      INSERT INTO teachers (user_id, name)
      VALUES ($1, $2)
    `;

    let result = await dbQuery(SQL, newUserID, name);

    if(result.rowCount === 0) throw new Error("Something went wrong");

    let newTeacherID = await this.getTeacherID(newUserID)

    return newTeacherID;
  }

  async dropCourse(courseID) {
    let SQL = `
        DELETE FROM courses 
         WHERE id = $1
     `;
    
    let result = await dbQuery(SQL, courseID);

    if(result.rowCount === 0) return false;

    return true;
  }

  async createCourse(teacherID, courseName, period) {
    let SQL = `
      INSERT INTO courses (teacher_id, name, period)
      VALUES ($1, $2, $3)
    `;

    let result = await dbQuery(SQL, teacherID, courseName, period);

    if (result.rowCount === 0) throw new Error("Something went wrong");

    let newCourseIDSQL = `
      SELECT id FROM courses
       WHERE teacher_id = $1 AND period = $2
    `;

    let newCourseID = await dbQuery(newCourseIDSQL, teacherID, period);

  
    return newCourseID.rows[0].id;

  }

  async getClassList(limit, offset) {
    let SQL = `
      SELECT c.id AS course_id, c.period, c.name AS class_name, t.name AS teacher_name, count(sc.student_id) AS student_count
        FROM courses AS c
        LEFT JOIN teachers AS t
          ON t.id = c.teacher_id
        LEFT JOIN students_courses AS sc
          ON sc.course_id = c.id
       GROUP BY c.id, c.period, c.name, t.name
       ORDER BY c.period, c.name, t.name
       LIMIT $1 OFFSET $2;
    `;

    let result = await dbQuery(SQL, limit, offset);

    return result.rows;
  }

  async getTeacherList() {
    let SQL = `
      SELECT id, name FROM teachers
       ORDER BY id ASC
    `;

    let result = await dbQuery(SQL);

    return result.rows;
  }

  async getClassesCount() {
    let SQL = `
      SELECT count(id) FROM courses;
    `;

    let result = await dbQuery(SQL);

    if(result.rowCount === 0) return 0;

    return result.rows[0].count;
  }

  async isTeacherAvailable(teacherID, period) {
    let SQL = `
      SELECT id FROM courses
       WHERE teacher_id = $1 AND period = $2
    `;

    let result = await dbQuery(SQL, teacherID, period);

    return result.rowCount === 0;
  }

  async updateCourseName(courseID, newCourseName) {
    let SQL = `
      UPDATE courses
         SET name = $2
       WHERE id = $1
    `;

    let result = await dbQuery(SQL, courseID, newCourseName);

    if(result.rowCount === 0) throw new Error("Something went wrong");

    return true;
  }
};

module.exports = PgPersistance;