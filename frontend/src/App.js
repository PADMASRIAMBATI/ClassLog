import React from "react";
import {BrowserRouter as Router,Route,Routes} from "react-router-dom";
import Home from "./components/Home";
import Navbar from "./components/Navbar";
import Register from "./components/Register";
import Login from "./components/Login";
import Dashboard from "./components/Dashboard";
import CourseOutline from "./components/CourseOutline"
import PDFPreview from "./components/generate"

import LecturePlan from "./components/LecturePlan"
import UploadVideo from "./components/UploadVideo";
import RequestResetPassword from './components/RequestResetPassword';
import ResetPassword from './components/ResetPassword';
import Profile from './components/Profile';
import UpdateDashboard from './components/UpdateDashboard';
import "./App.css";
function App() {
  return (
    <Router>
      <Navbar username="John Doe" />{" "}
      {/* Pass the username or relevant prop here */}
      <div >
        <div className="auth-wrapper">
          <div >
            <Routes>
              {/* Public Routes */}
              <Route path="/" element={<Home />} />
              <Route path="/Register" element={<Register />} />
              <Route path="/Login" element={<Login />} />
              <Route path="/Dashboard" element={<Dashboard />} />
              <Route path="/CourseOutline/:subjectId" element={<CourseOutline />} />
              <Route path="/quiz/:lectureId" element={<PDFPreview pdfFileName="Quiz.pdf" heading="Generate Quiz" />} />
              <Route path="/notes/:lectureId" element={<PDFPreview pdfFileName="Notes.pdf" heading="Generate Notes"/>} />
              <Route path="/Lecture/:lectureId" element={<LecturePlan />} />
              <Route path="/upload/:lectureId" element={<UploadVideo/>} />
              <Route path="/request-reset-password" element={<RequestResetPassword/>} />
              <Route path="/reset-password" element={<ResetPassword/>} />
              <Route path="/profile" element={<Profile/>} />
              <Route path="/update-dashboard" element={<UpdateDashboard />} />
            </Routes>
          </div>
        </div>
      </div>
    </Router>
  );
}

export default App;
