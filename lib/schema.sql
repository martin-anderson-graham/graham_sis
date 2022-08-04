CREATE TABLE users(
  id serial PRIMARY KEY,
  username text UNIQUE NOT NULL,
  password text NOT NULL,
  role text NOT NULL,
    CONSTRAINT role_check
    CHECK (role = ANY (ARRAY['teacher', 'student', 'administrator']))
);

CREATE TABLE admin(
  id serial PRIMARY KEY,
  user_id integer UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL
);

CREATE TABLE teachers(
  id serial PRIMARY KEY,
  user_id integer UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL
);

CREATE TABLE students(
  id serial PRIMARY KEY,
  user_id integer UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  grade integer NOT NULL
);

CREATE TABLE courses(
  id serial PRIMARY KEY,
  name text NOT NULL,
  teacher_id integer NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  period integer NOT NULL,
    CONSTRAINT unique_period_teacher UNIQUE (teacher_id, period), 
    CONSTRAINT valid_period CHECK (period BETWEEN 1 AND 8)
);

CREATE TABLE students_courses(
  id serial PRIMARY KEY,
  student_id integer NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  course_id integer NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  grade decimal(4, 1) NOT NULL,
    CONSTRAINT valid_grade CHECK (grade BETWEEN 0 AND 100)
    -- A constraint that prevented students from being enrolled in two classes
    -- in the same period would be appropriate, but I'm drawing the line
);

