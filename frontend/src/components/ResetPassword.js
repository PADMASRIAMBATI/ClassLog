import React, { useState, useEffect } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import "./Home.css";

function ResetPassword() {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const navigate = useNavigate();
  
  const API_URL = 'http://localhost:5000';

  useEffect(() => {
    // Check if we have a reset token on component mount
    const token = localStorage.getItem("reset_token");
    if (!token) {
      setErrorMessage("Reset token not found. Please request a password reset first.");
    }
  }, []);

  const validatePassword = (password) => {
    // Password should be at least 8 characters, include a number & special character
    const regex = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    return regex.test(password);
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");

    // Validate password strength
    if (!validatePassword(newPassword)) {
      setErrorMessage(
        "Password must be at least 8 characters long and include a number and a special character."
      );
      return;
    }

    // Validate password matching
    if (newPassword !== confirmPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }

    // Retrieve JWT token from localStorage
    const token = localStorage.getItem("reset_token");

    if (!token) {
      setErrorMessage("Reset token not found. Please request a password reset first.");
      return;
    }

    try {
      // Send reset password request to backend
      const response = await axios.post(
        `${API_URL}/reset-password`,
        {
          new_password: newPassword,
          confirm_password: confirmPassword,
        },
        {
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
          },
        }
      );

      // Handle successful response
      setSuccessMessage("Password has been reset successfully!");
      
      // Clear the reset token
      localStorage.removeItem("reset_token");
      
      // Redirect to login page after 3 seconds
      setTimeout(() => navigate("/login"), 3000);
    } catch (error) {
      console.error("Error resetting password:", error);
      if (error.response) {
        setErrorMessage(error.response.data.message);
      } else {
        setErrorMessage("Failed to connect to the server. Please try again later.");
      }
    }
  };

  return (
    <div className="form-container">
      <h2>Reset Password</h2>
      
      {errorMessage && <div className="error-message">{errorMessage}</div>}
      {successMessage && <div className="success-message">{successMessage}</div>}
      
      <form onSubmit={handleResetPassword}>
        <div className="form-group">
          <label htmlFor="newPassword">New Password:</label>
          <input
            type="password"
            id="newPassword"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
          />
          <small className="form-text text-muted">
            Password must be at least 8 characters long and include a number and a special character.
          </small>
        </div>
        
        <div className="form-group">
          <label htmlFor="confirmPassword">Confirm Password:</label>
          <input
            type="password"
            id="confirmPassword"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />
        </div>
        
        <button type="submit" className="btn-submit">
          Reset Password
        </button>
      </form>
    </div>
  );
}

export default ResetPassword;