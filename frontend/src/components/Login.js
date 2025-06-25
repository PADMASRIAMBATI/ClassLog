import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import './Login.css';

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  
  const handleLogin = async (e) => {
    e.preventDefault();
    setError(''); // Clear any previous errors
    
    try {
      // Send the actual form values instead of hardcoded values
      const response = await axios.post('http://localhost:5000/login', {
        email: email,
        password: password
      });
      
      const token = response.data.access_token;
      
      if (token) {
        // Save userId and token to localStorage
        localStorage.setItem('userId', email);
        localStorage.setItem('token', token);
        
        console.log('Token successfully stored:', token);
        
        // Redirect user to the dashboard on successful login
        navigate('/dashboard');
      } else {
        setError('Login failed. Token not received.');
        console.error('Token not received:', response.data);
      }
    } catch (error) {
      console.error('Login error:', error.response?.data?.message || error.message);
      setError(error.response?.data?.message || 'Invalid credentials. Please check your email and password.');
    }
  };
  
  return (
    <form className="form-container" onSubmit={handleLogin}>
      <h3>Sign In</h3>
      
      {/* Display error message if any */}
      {error && <div className="alert alert-danger">{error}</div>}
      
      {/* Email Input Field */}
      <div className="mb-3">
        <label>Email</label>
        <input
          type="email"
          className="form-control"
          placeholder="Enter email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>
      
      {/* Password Input Field */}
      <div className="mb-3">
        <label>Password</label>
        <input
          type="password"
          className="form-control"
          placeholder="Enter password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>
      
      {/* Remember Me Checkbox */}
      <div className="mb-3">
        <div className="custom-control custom-checkbox">
          <input
            type="checkbox"
            className="custom-control-input"
            id="customCheck1"
          />
          <label className="custom-control-label" htmlFor="customCheck1">
            &nbsp; Remember me
          </label>
        </div>
      </div>
      
      {/* Submit Button */}
      <div className="d-grid">
        <button type="submit" className="btn btn-primary" style={{ backgroundColor: '#6f42c1' }}>
          Submit
        </button>
      </div>
      
      {/* Forgot Password Link */}
      <div className="forgot-password text-right">
        Forgot <a href="/request-reset-password">password?</a>
      </div>
    </form>
  );
}

export default Login;