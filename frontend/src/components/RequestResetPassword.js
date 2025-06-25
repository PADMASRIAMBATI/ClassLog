import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import './Home.css';

function RequestResetPassword() {
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [resetToken, setResetToken] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const navigate = useNavigate();
  
  const API_URL = 'http://localhost:5000';

  const handleRequestResetPassword = async (e) => {
    e.preventDefault();
    setErrorMessage('');
    
    try {
      const response = await axios.post(`${API_URL}/request-reset-password`, { email });
      alert(response.data.message);
      setIsOtpSent(true);
    } catch (error) {
      console.error('Error requesting password reset:', error);
      if (error.response) {
        setErrorMessage(error.response.data.message);
      } else {
        setErrorMessage('Failed to connect to the server. Please try again later.');
      }
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setErrorMessage('');
    
    try {
      const response = await axios.post(`${API_URL}/verify-otp`, { 
        email, 
        otp: parseInt(otp, 10) 
      });
      
      if (response.data.reset_token) {
        // Store the reset token in localStorage
        localStorage.setItem('reset_token', response.data.reset_token);
        alert('OTP verified successfully');
        navigate('/reset-password');
      }
    } catch (error) {
      console.error('Error verifying OTP:', error);
      if (error.response) {
        setErrorMessage(error.response.data.message);
      } else {
        setErrorMessage('Failed to verify OTP. Please try again.');
      }
    }
  };

  return (
    <div className="form-container">
      <h3>Request Password Reset</h3>
      
      {errorMessage && <div className="alert alert-danger">{errorMessage}</div>}
      
      <form onSubmit={isOtpSent ? handleVerifyOtp : handleRequestResetPassword}>
        <div className="mb-3">
          <label htmlFor="email">Email:</label>
          <input
            type="email"
            className="form-control"
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={isOtpSent}
          />
        </div>
        
        {isOtpSent && (
          <div className="mb-3">
            <label htmlFor="otp">OTP:</label>
            <input
              type="text"
              className="form-control"
              id="otp"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              required
            />
          </div>
        )}
        
        <button type="submit" className="btn btn-primary" style={{ backgroundColor: '#6f42c1' }}>
          {isOtpSent ? 'Verify OTP' : 'Request OTP'}
        </button>
      </form>
    </div>
  );
}

export default RequestResetPassword;