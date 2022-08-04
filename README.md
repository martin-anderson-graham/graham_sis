

# Welcome to GRAHAM-SIS

## Instructions
- Run `npm run sql-setup` to create database and load seed-data.  
    - Prior to the running the script for the first time you must manually create a `sis` database
    - On subsequent executions this will drop and re-create the `sis` database and reload all the schema and data.
- Update the `DATABASE_URL` environment variable in `.env`
- To log in as a user:
  - administrator (after my revision I believe this is the only role you need to check for the required functionality)
    - admin1 / admin1
  - teachers
    - teach2  through teach10 (password is same as username)
  - students
    - stu11 through stu200 (password is same as username)
- For the purposes of the assessment requirements I am considering `courses` to be collections of `students`.  These are the two kinds of related data I provided CRUD functionality for.

**Node version**: v18.0.0

**Browser**: Chrome 101.0.4951.54

**PostgreSQL**: 12.9

## Tradeoffs/Considerations

- I often wanted to preserve some state (such as the period a teacher is viewing) when performing actions (such as adding a student or updating a grade).  I elected to pass the information as query parameters and/or hidden inputs (rather then storing them with the session data).  This worked well for my simple use cases, but I'm not sure it would scale well.


## Database Structure

- users
  - id
  - username
  - password
  - role ( must be either ["teacher" or "student" or "administrator"])
- admin
  - id
  - user_id (FK users(id) ODC)
  - name
- teachers
  - id
  - user_id (FK users(id) ODC)
  - name
- students
  - id
  - user_id (FK users(id) ODC)
  - name
  - grade
- courses
  - id
  - name
  - teacher_id (FK teachers(id) ODC)
  - period
- students_courses
  - id
  - student_id (FK students(id) ODC)
  - course_id (FK courses(id) ODC)
  - grade

