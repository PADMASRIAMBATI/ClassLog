import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import 'bootstrap/dist/css/bootstrap.min.css';
import './Navbar.css';

const Navbar = () => {
  const [user, setUser] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();

  // Function to check authentication status
  const checkAuthStatus = () => {
    const token = localStorage.getItem('token');
    if (token) {
      axios.get('http://127.0.0.1:5000/user', {
        headers: { Authorization: `Bearer ${token}` }
      })
      .then(response => {
        setUser(response.data.username);
      })
      .catch(error => {
        console.log(error);
        // If token is invalid, clear it
        if (error.response && error.response.status === 401) {
          localStorage.removeItem('token');
          setUser(null);
        }
      });
    } else {
      setUser(null);
    }
  };

  // Initial authentication check
  useEffect(() => {
    checkAuthStatus();
  }, []);

  // Re-check auth status when location changes (page navigation)
  useEffect(() => {
    checkAuthStatus();
  }, [location.pathname]);

  // Add event listener for custom login event
  useEffect(() => {
    const handleLoginEvent = () => {
      checkAuthStatus();
    };

    window.addEventListener('user-logged-in', handleLoginEvent);
    
    return () => {
      window.removeEventListener('user-logged-in', handleLoginEvent);
    };
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    setUser(null);
    navigate('/login');
    // Dispatch event that logout occurred
    window.dispatchEvent(new Event('user-logged-out'));
  };

  return (
    <nav className="navbar navbar-expand-lg navbar-light" style={{ backgroundColor: '#6f42c1' }}>
      <div className="container-fluid">
        <Link className="navbar-brand" to="/">
          <img
            src="/logo-min.jpg"
            alt="ClassLog Logo"
            width="30"
            height="30"
            className="d-inline-block align-text-top me-2"
          />
          <span className="text-white">ClassLog</span>
        </Link>
        
        <button 
          className="navbar-toggler" 
          type="button" 
          data-bs-toggle="collapse" 
          data-bs-target="#navbarNav" 
          aria-controls="navbarNav" 
          aria-expanded="false" 
          aria-label="Toggle navigation"
        >
          <span className="navbar-toggler-icon"></span>
        </button>
        
        <div className="collapse navbar-collapse" id="navbarNav">
          <ul className="navbar-nav me-auto mb-2 mb-lg-0">
            <li className="nav-item">
              <Link className="nav-link text-white" to="/">Home</Link>
            </li>
            {user && (
              <li className="nav-item">
                <Link className="nav-link text-white" to="/dashboard">Dashboard</Link>
              </li>
            )}
          </ul>
          
          <div className="d-flex">
            {user ? (
              <div className="d-flex align-items-center">
                <Link className="nav-link text-white me-3" to="/profile">
                  Hello, {user}
                </Link>
                <button
                  className="btn btn-outline-light"
                  onClick={handleLogout}
                >
                  Logout
                </button>
              </div>
            ) : (
              <div className="d-flex">
                <Link className="btn btn-outline-light me-2" to="/login">Login</Link>
                <Link className="btn btn-light" to="/register">Register</Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;