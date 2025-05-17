const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const session = require('express-session');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const User = require('./models/User'); // You'll need to create this model

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(session({
  secret: 'your-secret-key',
  resave: false,
  saveUninitialized: false
}));
app.use(passport.initialize());
app.use(passport.session());

// MongoDB Connection
mongoose.connect('mongodb://localhost:27017/lms-system', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

// Passport Configuration
passport.use(new LocalStrategy(
  { usernameField: 'email' },
  async (email, password, done) => {
    try {
      const user = await User.findOne({ email });
      if (!user) {
        return done(null, false, { message: 'Incorrect email.' });
      }
      const isValid = await user.comparePassword(password);
      if (!isValid) {
        return done(null, false, { message: 'Incorrect password.' });
      }
      return done(null, user);
    } catch (error) {
      return done(error);
    }
  }
));

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (error) {
    done(error);
  }
});

// Helper functions for role checking
const hasInstructorPrivileges = (user) => {
  return user && (user.role === 'instructor' || user.role === 'admin');
};

const hasAdminPrivileges = (user) => {
  return user && user.role === 'admin';
};

// Course Schema
const courseSchema = new mongoose.Schema({
  id: String,
  instructor: String,
  title: String,
  description: String,
  createdAt: String,
  updatedAt: String,
  students: Number
});

const Course = mongoose.model('Course', courseSchema);

// GET /api/courses/instructor
app.get('/api/courses/instructor', async (req, res) => {
  try {
    // Check if user is authenticated
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Check if user has instructor or admin privileges
    const isInstructorOrAdmin = hasInstructorPrivileges(req.user) || hasAdminPrivileges(req.user);
    
    if (!isInstructorOrAdmin) {
      return res.status(403).json({ 
        error: 'Unauthorized - Only instructors or admins can access instructor courses' 
      });
    }

    // Fetch courses based on user role
    let coursesData;
    
    if (hasAdminPrivileges(req.user)) {
      // Admins can see all courses
      coursesData = await Course.find({});
    } else {
      // Instructors can only see their own courses
      coursesData = await Course.find({ instructor: req.user.name });
    }
    
    res.json(coursesData);
  } catch (error) {
    console.error('Error fetching instructor courses:', error);
    res.status(500).json({ error: 'Failed to fetch instructor courses' });
  }
});

// POST /api/courses/instructor
app.post('/api/courses/instructor', async (req, res) => {
  try {
    // Check if user is authenticated and is an instructor or admin
    if (!req.user || (req.user.role !== 'instructor' && req.user.role !== 'admin')) {
      return res.status(401).json({ 
        error: 'Unauthorized - Only instructors or admins can create courses' 
      });
    }

    const courseData = req.body;
    
    // Use the instructor from the form data if provided, otherwise use the session user
    if (!courseData.instructor) {
      courseData.instructor = req.user.name || 'Unknown Instructor';
    }
    
    // Generate a unique ID for new courses
    if (!courseData.id) {
      const lastCourse = await Course.findOne().sort({ id: -1 });
      const newId = lastCourse ? String(Number(lastCourse.id) + 1) : '1';
      courseData.id = newId;
    }

    // Set creation/update timestamps
    const now = new Date().toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
    
    if (!courseData.createdAt) {
      courseData.createdAt = now;
    }
    
    courseData.updatedAt = now;
    
    // Initialize students count if not provided
    if (!courseData.students) {
      courseData.students = 0;
    }

    // Insert or update the course
    const result = await Course.findOneAndUpdate(
      { id: courseData.id },
      courseData,
      { upsert: true, new: true }
    );

    res.json({
      message: result.isNew ? 'Course created successfully' : 'Course updated successfully',
      courseId: courseData.id
    });
  } catch (error) {
    console.error('Error creating/updating course:', error);
    res.status(500).json({ error: 'Failed to create/update course' });
  }
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
