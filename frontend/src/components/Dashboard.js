import React, { useState, useEffect } from "react";
import axios from "axios";
import { Button, TextField, Card, CardContent, Typography, IconButton } from "@mui/material";
import { Edit, Delete, Add } from "@mui/icons-material";
import { useNavigate } from "react-router-dom";
import './Dashboard.css';

const Dashboard = () => {
  const [subjects, setSubjects] = useState([]);
  const [newSubject, setNewSubject] = useState({ name: "", grade: "" });
  const [isEditing, setIsEditing] = useState(null);
  const navigate = useNavigate();

  // Set up axios with authentication token
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    } else {
      // Redirect to login if no token
      navigate('/login');
    }
  }, [navigate]);

  // Fetch all subjects for the user
  const fetchSubjects = async () => {
    try {
      const response = await axios.get('http://localhost:5000/subjects');
      setSubjects(response.data);
    } catch (error) {
      console.error("Error fetching subjects:", error);
      if (error.response && error.response.status === 401) {
        // Redirect to login if unauthorized
        navigate('/login');
      }
    }
  };

  useEffect(() => {
    fetchSubjects();
  }, []);

  const handleAddSubject = async () => {
    if (newSubject.name && newSubject.grade) {
      try {
        const subjectData = { 
          name: newSubject.name, 
          grade: newSubject.grade 
        };
        
        const response = await axios.post("http://localhost:5000/subject", subjectData);
        
        // Add the new subject with the ID returned from the backend
        const newSubjectWithId = {
          ...subjectData,
          id: response.data.id
        };
        
        setSubjects([...subjects, newSubjectWithId]);
        setNewSubject({ name: "", grade: "" });
      } catch (error) {
        console.error("Error adding subject:", error);
      }
    }
  };

  const handleEditSubject = async (id) => {
    if (newSubject.name && newSubject.grade) {
      try {
        const subjectData = { 
          name: newSubject.name, 
          grade: newSubject.grade 
        };
        
        await axios.put(`http://localhost:5000/subject/${id}`, subjectData);
        
        const updatedSubjects = subjects.map((subject) =>
          subject.id === id ? { ...subject, ...subjectData } : subject
        );
        
        setSubjects(updatedSubjects);
        setIsEditing(null);
        setNewSubject({ name: "", grade: "" });
      } catch (error) {
        console.error("Error updating subject:", error);
      }
    }
  };

  const handleDeleteSubject = async (id) => {
    try {
      await axios.delete(`http://localhost:5000/subject/${id}`);
      const filteredSubjects = subjects.filter((subject) => subject.id !== id);
      setSubjects(filteredSubjects);
    } catch (error) {
      console.error("Error deleting subject:", error);
    }
  };

  const handleCardClick = (id) => {
    navigate(`/courseOutline/${id}`);
  };

  return (
    <div style={{ padding: "20px", maxWidth: "800px", margin: "0 auto", textAlign: "center" }}>
      <Typography variant="h4" gutterBottom>
        ClassLog
      </Typography>

      {subjects.length > 0 ? (
        subjects.map((subject) => (
          <Card
            key={subject.id}
            style={{ margin: "10px 0", backgroundColor: "#f9f6ff", cursor: "pointer" }}
            onClick={() => handleCardClick(subject.id)}
          >
            <CardContent
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div>
                <Typography variant="h6">{subject.name}</Typography>
                <Typography variant="subtitle1" color="textSecondary">
                  {subject.grade}
                </Typography>
              </div>
              <div>
                <IconButton
                  onClick={(e) => {
                    e.stopPropagation(); // Prevent card click
                    setIsEditing(subject.id);
                    setNewSubject({ name: subject.name, grade: subject.grade });
                  }}
                >
                  <Edit />
                </IconButton>
                <IconButton
                  onClick={(e) => {
                    e.stopPropagation(); // Prevent card click
                    handleDeleteSubject(subject.id);
                  }}
                >
                  <Delete />
                </IconButton>
              </div>
            </CardContent>
          </Card>
        ))
      ) : (
        <Typography variant="body1" style={{ margin: "20px 0" }}>
          No subjects found. Add your first subject below.
        </Typography>
      )}

      <div style={{ marginTop: "20px" }}>
        <TextField
          label="Subject Name"
          value={newSubject.name}
          onChange={(e) => setNewSubject({ ...newSubject, name: e.target.value })}
          style={{ marginRight: "10px" }}
        />
        <TextField
          label="Grade"
          value={newSubject.grade}
          onChange={(e) => setNewSubject({ ...newSubject, grade: e.target.value })}
          style={{ marginRight: "10px" }}
        />
        {isEditing ? (
          <Button
            variant="contained"
            color="primary"
            onClick={() => handleEditSubject(isEditing)}
          >
            Update
          </Button>
        ) : (
          <Button
            variant="contained"
            color="primary"
            onClick={handleAddSubject}
            startIcon={<Add />}
          >
            Add Subject
          </Button>
        )}
      </div>
    </div>
  );
};

export default Dashboard;