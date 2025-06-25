import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import { marked } from "marked";
import html2pdf from "html2pdf.js";
import './LecturePlan.css';

const LecturePlan = () => {
  const { lectureId } = useParams();
  const navigate = useNavigate();
  const [lecture, setLecture] = useState(null);
  const [lecturePlan, setLecturePlan] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  // Get authentication token from localStorage
  const getAuthToken = () => {
    return localStorage.getItem('token');
  };

  useEffect(() => {
    if (lectureId) {
      fetchLectureDetails();
      fetchLecturePlan();
    } else {
      setError("No lecture ID provided in the URL.");
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lectureId]);

  const fetchLectureDetails = async () => {
    try {
      const token = getAuthToken();
      if (!token) {
        navigate('/login');
        return;
      }
      
      const response = await fetch(`http://localhost:5000/lecture/${lectureId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setLecture(data);
      } else if (response.status === 404) {
        setError("Lecture not found.");
        setLoading(false);
      } else if (response.status === 401) {
        localStorage.removeItem('token');
        navigate('/login');
      } else {
        throw new Error("Failed to fetch lecture details.");
      }
    } catch (error) {
      console.error("Error fetching lecture details:", error);
      setError("An error occurred while fetching lecture details.");
      setLoading(false);
    }
  };

  const fetchLecturePlan = async () => {
    try {
      const token = getAuthToken();
      if (!token) {
        navigate('/login');
        return;
      }
      
      const response = await fetch(`http://localhost:5000/lectureplan/${lectureId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setLecturePlan(data.content);
      } else if (response.status === 404) {
        // No lecture plan exists yet, just set empty content
        setLecturePlan("");
      } else if (response.status === 401) {
        localStorage.removeItem('token');
        navigate('/login');
      } else {
        const errorText = await response.text();
        console.error("Error response from server:", errorText);
        try {
          const errorData = JSON.parse(errorText);
          throw new Error(errorData.error || "Failed to fetch lecture plan.");
        } catch (parseError) {
          throw new Error("Failed to fetch lecture plan: " + errorText);
        }
      }
    } catch (error) {
      console.error("Error fetching lecture plan:", error);
      setError("An error occurred while fetching the lecture plan: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const generateLecturePlan = async () => {
    if (!lectureId) {
      console.error("Lecture ID not available");
      return;
    }
    try {
      const token = getAuthToken();
      if (!token) {
        navigate('/login');
        return;
      }
      
      setLoading(true);
      
      const response = await fetch(`http://localhost:5000/generatelectureplan/${lectureId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        // After successful generation, fetch the plan
        await fetchLecturePlan();
        alert("Lecture plan generated successfully!");
      } else if (response.status === 401) {
        localStorage.removeItem('token');
        navigate('/login');
      } else {
        // Try to get error details
        const errorText = await response.text();
        console.error("Error response from server:", errorText);
        try {
          const errorData = JSON.parse(errorText);
          throw new Error(errorData.error || "Failed to generate lecture plan.");
        } catch (parseError) {
          throw new Error("Failed to generate lecture plan: " + errorText);
        }
      }
    } catch (error) {
      console.error("Error generating lecture plan:", error);
      alert(`An error occurred while generating the lecture plan: ${error.message}`);
      setLoading(false);
    }
  };

  const saveLecturePlan = async () => {
    if (!lectureId) {
      console.error("Lecture ID not available");
      return;
    }
    try {
      const token = getAuthToken();
      if (!token) {
        navigate('/login');
        return;
      }
      
      setLoading(true);
      
      const response = await fetch(`http://localhost:5000/lectureplan/${lectureId}`, {
        method: "PUT",
        headers: {
          'Authorization': `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content: lecturePlan }),
      });
      
      if (response.ok) {
        alert("Lecture plan updated successfully!");
        setEditMode(false);
      } else if (response.status === 401) {
        localStorage.removeItem('token');
        navigate('/login');
      } else {
        const errorText = await response.text();
        console.error("Error response from server:", errorText);
        try {
          const errorData = JSON.parse(errorText);
          throw new Error(errorData.error || "Failed to update lecture plan.");
        } catch (parseError) {
          throw new Error("Failed to update lecture plan: " + errorText);
        }
      }
    } catch (error) {
      console.error("Error updating lecture plan:", error);
      alert(`An error occurred while updating the lecture plan: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Function to preprocess content for proper page breaks
  const preprocessContentForPageBreaks = (content) => {
    // Add page break hints before each heading
    return content.replace(/(?=#{1,6}\s)/g, '<div style="page-break-before: always;"></div>');
  };

  const downloadLecturePDF = async () => {
    if (!lecturePlan) {
      alert("No lecture plan content available to download.");
      return;
    }
    
    setPdfLoading(true);
    
    try {
      // Convert markdown to HTML without adding unnecessary page breaks
      const htmlContent = marked(lecturePlan);
      
      // Create styled container for PDF
      const element = document.createElement('div');
      element.className = 'pdf-content';
      element.innerHTML = htmlContent;
      
      // Apply styles for PDF content
      Object.assign(element.style, {
        maxWidth: '800px',
        margin: '20px auto',
        fontFamily: 'Arial, sans-serif',
        fontSize: '12px',
        lineHeight: '1.6',
        padding: '20px'
      });
      
      // Add title as a header
      const titleElement = document.createElement('div');
      titleElement.className = 'pdf-title';
      titleElement.innerHTML = `<h1 style="text-align: center; color: purple; margin-bottom: 10px;">Lecture Plan</h1>`;
      if (lecture) {
        titleElement.innerHTML += `<h2 style="text-align: center; margin-bottom: 30px;">Lecture ${lecture.lecture_number}: ${lecture.title}</h2>`;
      }
      
      // Insert title before content
      element.insertBefore(titleElement, element.firstChild);
      
      // Configure PDF options
      const options = {
        margin: [20, 20, 20, 20], // [top, right, bottom, left]
        filename: `Lecture_Plan_${lectureId}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { 
          scale: 2,
          useCORS: true,
          logging: false,
          letterRendering: true
        },
        jsPDF: { 
          unit: 'mm', 
          format: 'a4', 
          orientation: 'portrait',
          compress: true
        },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
      };
      
      // Generate and download PDF
      await html2pdf().from(element).set(options).save();
      setPdfLoading(false);
    } catch (error) {
      console.error("Error generating PDF:", error);
      alert(`Failed to generate PDF: ${error.message}`);
      setPdfLoading(false);
    }
  };

  const cancelEdit = () => {
    setEditMode(false);
    fetchLecturePlan();
  };

  if (loading) {
    return (
      <div style={{ padding: "20px", fontFamily: "Arial, sans-serif" }}>
        <h1 style={{ textAlign: "center", color: "purple" }}>Lecture Plan</h1>
        <p style={{ textAlign: "center" }}>Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: "20px", fontFamily: "Arial, sans-serif" }}>
        <h1 style={{ textAlign: "center", color: "purple" }}>Lecture Plan</h1>
        <p style={{ textAlign: "center", color: "red" }}>{error}</p>
        <div style={{ textAlign: "center", marginTop: "20px" }}>
          <button
            onClick={() => navigate("/")}
            style={{
              padding: "10px 20px",
              backgroundColor: "purple",
              color: "white",
              border: "none",
              borderRadius: "5px",
              cursor: "pointer",
            }}
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "20px", fontFamily: "Arial, sans-serif", marginTop: "20px", paddingTop: "60px" }}>
      <h1 style={{ textAlign: "center", color: "purple", marginBottom: "20px" }}>Lecture Plan</h1>
      {lecture && (
        <h2 style={{ textAlign: "center" }}>
          Lecture {lecture.lecture_number}: {lecture.title}
        </h2>
      )}

      {/* Generate Lecture Plan Button */}
      <div style={{ textAlign: "center", marginBottom: "20px" }}>
        <button
          onClick={generateLecturePlan}
          style={{
            padding: "10px 20px",
            backgroundColor: "purple",
            color: "white",
            border: "none",
            borderRadius: "5px",
            cursor: "pointer"
          }}
          disabled={loading}
        >
          {loading ? "Generating..." : "Generate Lecture Plan"}
        </button>
      </div>

      {/* Download PDF Button */}
      {lecturePlan && (
        <div style={{ marginBottom: "20px", textAlign: "center" }}>
          <button
            onClick={downloadLecturePDF}
            style={{
              padding: "10px 20px",
              backgroundColor: "green",
              color: "white",
              border: "none",
              borderRadius: "5px",
              cursor: pdfLoading ? "not-allowed" : "pointer",
              opacity: pdfLoading ? 0.7 : 1
            }}
            disabled={pdfLoading}
          >
            {pdfLoading ? "Generating PDF..." : "Download as PDF"}
          </button>
        </div>
      )}

      {/* Lecture Plan Content */}
      <div
        style={{
          marginTop: "20px",
          border: "1px solid #ddd",
          borderRadius: "5px",
          padding: "20px",
          minHeight: "200px",
          backgroundColor: "white",
        }}
      >
        <h3 style={{ color: "purple" }}>Lecture Plan Content</h3>
        {loading ? (
          <div style={{ textAlign: "center", margin: "50px 0" }}>
            <p>Loading...</p>
          </div>
        ) : editMode ? (
          <textarea
            value={lecturePlan}
            onChange={(e) => setLecturePlan(e.target.value)}
            style={{ width: "100%", height: "400px", padding: "10px" }}
          />
        ) : (
          <ReactMarkdown>{lecturePlan || "No lecture plan available. Click 'Generate Lecture Plan' to create one."}</ReactMarkdown>
        )}
      </div>

      {/* Edit and Save Buttons */}
      <div style={{ textAlign: "center", marginTop: "20px" }}>
        {editMode ? (
          <>
            <button
              onClick={saveLecturePlan}
              style={{
                padding: "10px 20px",
                backgroundColor: "green",
                color: "white",
                border: "none",
                borderRadius: "5px",
                marginRight: "10px",
                cursor: "pointer",
              }}
              disabled={loading}
            >
              Save
            </button>
            <button
              onClick={cancelEdit}
              style={{
                padding: "10px 20px",
                backgroundColor: "gray",
                color: "white",
                border: "none",
                borderRadius: "5px",
                cursor: "pointer",
              }}
              disabled={loading}
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            onClick={() => setEditMode(true)}
            style={{
              padding: "10px 20px",
              backgroundColor: lecturePlan ? "orange" : "gray",
              color: "white",
              border: "none",
              borderRadius: "5px",
              cursor: lecturePlan ? "pointer" : "not-allowed",
            }}
            disabled={!lecturePlan || loading}
          >
            Edit Lecture Plan
          </button>
        )}
      </div>

      {/* Navigation Buttons */}
      <div style={{ display: "flex", justifyContent: "center", marginTop: "20px", gap: "10px" }}>
        <button
          onClick={() => navigate("/")}
          style={{
            padding: "10px 20px",
            backgroundColor: "purple",
            color: "white",
            border: "none",
            borderRadius: "5px",
            cursor: "pointer",
          }}
        >
          Back to Home
        </button>
        
        {lecture && lecture.subject_id && (
          <button
            onClick={() => navigate(`/dashboard`)}
            style={{
              padding: "10px 20px",
              backgroundColor: "darkblue",
              color: "white",
              border: "none",
              borderRadius: "5px",
              cursor: "pointer",
            }}
          >
            Back to Subject
          </button>
        )}
      </div>

      {/* Generate Quiz */}
      <div style={{ textAlign: "center", marginTop: "10px" }}>
        <button
          onClick={() => navigate(`/quiz/${lectureId}`)}
          style={{
            padding: "10px 20px",
            backgroundColor: "purple",
            color: "white",
            border: "none",
            borderRadius: "5px",
            cursor: "pointer",
          }}
        >
          Generate Quiz
        </button>
      </div>

      {/* Generate Notes */}
      <div style={{ textAlign: "center", marginTop: "10px" }}>
        <button
          onClick={() => navigate(`/notes/${lectureId}`)}
          style={{
            padding: "10px 20px",
            backgroundColor: "purple",
            color: "white",
            border: "none",
            borderRadius: "5px",
            cursor: "pointer",
          }}
        >
          Generate Notes
        </button>
      </div>

     {/* Upload Class Video */}
     <div style={{ textAlign: "center", marginTop: "10px" }}>
        <button
          onClick={() => navigate(`/upload/${lectureId}`)}
          style={{
            padding: "10px 20px",
            backgroundColor: "purple",
            color: "white",
            border: "none",
            borderRadius: "5px",
            cursor: "pointer",
          }}
        >
          Upload Class Video
        </button>
      </div>
    </div>
  );
};

export default LecturePlan;