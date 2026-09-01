const { pool } = require('../config/db');

// GET /api/profile - Fetch student profile for logged-in student
const getStudentProfile = async (req, res) => {
  try {
    const userId = req.user.id;

    const [rows] = await pool.query(
      `SELECT id, full_name, email, phone, college, year_of_study, department, created_at, updated_at
       FROM users WHERE id = ?`,
      [userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        message: 'User profile not found.'
      });
    }

    return res.status(200).json({
      profile: rows[0]
    });
  } catch (error) {
    console.error('Error fetching student profile:', error);
    return res.status(500).json({
      message: 'Server error while fetching profile.'
    });
  }
};

// PUT /api/profile - Update student profile
const updateStudentProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { full_name, phone, college, year_of_study, department } = req.body;

    // Field Validation
    if (full_name !== undefined && full_name.trim() === '') {
      return res.status(400).json({ message: 'full_name cannot be empty.' });
    }
    if (phone !== undefined && phone.trim() === '') {
      return res.status(400).json({ message: 'phone cannot be empty.' });
    }

    const [existingRows] = await pool.query('SELECT * FROM users WHERE id = ?', [userId]);
    if (existingRows.length === 0) {
      return res.status(404).json({ message: 'User not found.' });
    }

    const existingUser = existingRows[0];

    const updatedFullName = full_name !== undefined ? full_name.trim() : existingUser.full_name;
    const updatedPhone = phone !== undefined ? phone.trim() : existingUser.phone;
    const updatedCollege = college !== undefined ? college.trim() : existingUser.college;
    const updatedYear = year_of_study !== undefined ? year_of_study.trim() : existingUser.year_of_study;
    const updatedDept = department !== undefined ? department.trim() : existingUser.department;

    await pool.query(
      `UPDATE users SET
        full_name = ?, phone = ?, college = ?, year_of_study = ?, department = ?
       WHERE id = ?`,
      [updatedFullName, updatedPhone, updatedCollege, updatedYear, updatedDept, userId]
    );

    const [updatedRows] = await pool.query(
      `SELECT id, full_name, email, phone, college, year_of_study, department, created_at, updated_at
       FROM users WHERE id = ?`,
      [userId]
    );

    return res.status(200).json({
      message: 'Profile updated successfully',
      profile: updatedRows[0]
    });

  } catch (error) {
    console.error('Error updating student profile:', error);
    return res.status(500).json({
      message: 'Server error while updating profile.'
    });
  }
};

module.exports = {
  getStudentProfile,
  updateStudentProfile
};
