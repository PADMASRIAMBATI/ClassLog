import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";

const CourseOutline = () => {
  const [chapters, setChapters] = useState([]);
  const [newChapter, setNewChapter] = useState({ name: "", total_lectures: "" });
  const [selectedChapterIndex, setSelectedChapterIndex] = useState(null);
  const [newTopic, setNewTopic] = useState({
    name: "",
    description: "",
    number_of_lectures: "",
  });

  const [editingChapterIndex, setEditingChapterIndex] = useState(null);
  const [editingTopicIndex, setEditingTopicIndex] = useState(null);
  const [editChapter, setEditChapter] = useState(null);
  const [editTopic, setEditTopic] = useState(null);

  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  // New state variables for lectures and subject ID
  const [lectures, setLectures] = useState([]);
  const [newLectureNumber, setNewLectureNumber] = useState("");
  const { subjectId } = useParams();

  useEffect(() => {
    fetchChapters();
    fetchLectures();
  }, [subjectId]); // Added subjectId dependency to properly handle route changes

  // Get authentication token
  const getAuthToken = () => {
    const token = localStorage.getItem('token');
    if (!token) {
      console.error("No authentication token found");
      alert("You are not authenticated. Please log in again.");
      navigate('/login');
      return null;
    }
    return token;
  };

  const fetchChapters = async () => {
    setLoading(true);
    try {
      const token = getAuthToken();
      if (!token) return;

      const response = await fetch(`http://localhost:5000/chapters/${subjectId}`, {
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to fetch chapters: ${response.status}`);
      }
      
      const data = await response.json();
      setChapters(data);
    } catch (error) {
      console.error("Error fetching chapters:", error);
      alert(`Error fetching chapters: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Fetch lectures for the current subject
  const fetchLectures = async () => {
    try {
      const token = getAuthToken();
      if (!token) return;

      const response = await fetch(`http://localhost:5000/lectures/${subjectId}`, {
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to fetch lectures: ${response.status}`);
      }
      
      const data = await response.json();
      // Sort lectures by lecture number
      data.sort((a, b) => a.lecture_number - b.lecture_number);
      setLectures(data);
    } catch (error) {
      console.error("Error fetching lectures:", error);
      alert(`Error fetching lectures: ${error.message}`);
    }
  };

  // Navigate to the lecture plan page using lecture ID
  const goToLecturePlan = (lectureId) => {
    navigate(`/lecture/${lectureId}`);
  };

  // Handle adding a new lecture
  const addLecture = async () => {
    if (!newLectureNumber.trim()) {
      alert("Please enter a lecture number");
      return;
    }
    
    const token = getAuthToken();
    if (!token) return;
    
    const lectureData = {
      lecture_number: parseInt(newLectureNumber, 10),
      subject_id: subjectId,
    };
    
    try {
      const response = await fetch("http://localhost:5000/lecture", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify(lectureData),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to add lecture: ${response.status}`);
      }

      const addedLecture = await response.json();
      // Update the lectures state and sort them
      setLectures((prevLectures) =>
        [...prevLectures, addedLecture].sort((a, b) => a.lecture_number - b.lecture_number)
      );
      setNewLectureNumber("");
      alert("Lecture added successfully!");
    } catch (error) {
      console.error("Error adding lecture:", error);
      alert(`An error occurred while adding the lecture: ${error.message}`);
    }
  };

  // Handle adding a new chapter
  const addChapter = async () => {
    if (!newChapter.name.trim() || !newChapter.total_lectures) {
      alert("Please fill out all required fields.");
      return;
    }
    
    const token = getAuthToken();
    if (!token) return;
    
    try {
      // Construct the chapter data
      const chapterData = {
        name: newChapter.name,
        subject_id: subjectId,
        total_lectures: parseInt(newChapter.total_lectures, 10)
      };
      
      const response = await fetch("http://localhost:5000/chapter", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify(chapterData),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to add chapter: ${response.status}`);
      }
      
      const addedChapter = await response.json();
      
      // Make sure the chapter has an empty topics array
      const newChapterWithTopics = { ...addedChapter, topics: [] };
      
      // Update chapters state
      setChapters([...chapters, newChapterWithTopics]);
      
      // Reset form
      setNewChapter({ name: "", total_lectures: "" });
      
      // Select the newly added chapter
      const newChapterIndex = chapters.length;
      setSelectedChapterIndex(newChapterIndex);
      
      alert("Chapter added successfully!");
    } catch (error) {
      console.error("Error adding chapter:", error);
      alert(`An error occurred while adding the chapter: ${error.message}`);
    }
  };

  // Handle deleting a chapter
  const deleteChapter = async (index) => {
    const chapterId = chapters[index].id;
    const token = getAuthToken();
    if (!token) return;
    
    try {
      const response = await fetch(`http://localhost:5000/chapter/${chapterId}`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to delete chapter: ${response.status}`);
      }
      
      const updatedChapters = chapters.filter((_, i) => i !== index);
      setChapters(updatedChapters);
      setSelectedChapterIndex(null);
      alert("Chapter deleted successfully!");
    } catch (error) {
      console.error("Error deleting chapter:", error);
      alert(`Error deleting chapter: ${error.message}`);
    }
  };

  // Handle editing a chapter
  const startEditingChapter = (index) => {
    setEditingChapterIndex(index);
    setEditChapter({ ...chapters[index] });
  };

  const saveEditedChapter = async () => {
    if (!editChapter.name.trim()) {
      alert("Chapter name cannot be empty");
      return;
    }
    
    const chapterId = chapters[editingChapterIndex].id;
    const token = getAuthToken();
    if (!token) return;
    
    try {
      // Make sure we're sending fields that match the backend expectations
      const updateData = {
        name: editChapter.name,
        total_lectures: parseInt(editChapter.total_lectures || editChapter.number_of_lectures || 0, 10)
      };
      
      const response = await fetch(`http://localhost:5000/chapter/${chapterId}`, {
        method: "PUT",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify(updateData),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to update chapter: ${response.status}`);
      }
      
      const updatedChapters = [...chapters];
      updatedChapters[editingChapterIndex] = { 
        ...updatedChapters[editingChapterIndex],
        name: editChapter.name,
        total_lectures: updateData.total_lectures,
        number_of_lectures: updateData.total_lectures,
        topics: chapters[editingChapterIndex].topics || [] 
      };
      setChapters(updatedChapters);
      setEditingChapterIndex(null);
      setEditChapter(null);
      alert("Chapter updated successfully!");
    } catch (error) {
      console.error("Error updating chapter:", error);
      alert(`Error updating chapter: ${error.message}`);
    }
  };

  const cancelEditChapter = () => {
    setEditingChapterIndex(null);
    setEditChapter(null);
  };

  // Handle selecting a chapter and fetching its topics
  const selectChapter = async (index) => {
    setSelectedChapterIndex(index);
    const chapterId = chapters[index].id;
    const token = getAuthToken();
    if (!token) return;
    
    try {
      const response = await fetch(`http://localhost:5000/topics/${chapterId}`, {
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to fetch topics: ${response.status}`);
      }
      
      const topics = await response.json();
      const updatedChapters = [...chapters];
      updatedChapters[index].topics = topics;
      setChapters(updatedChapters);
    } catch (error) {
      console.error("Error fetching topics:", error);
      alert(`Error loading topics: ${error.message}`);
    }
  };

  // Handle adding a new topic to the selected chapter
  const addTopicToChapter = async () => {
    if (selectedChapterIndex === null) {
      alert("Please select a chapter first.");
      return;
    }
    
    // Validate form fields
    if (!newTopic.name.trim() || !newTopic.description.trim() || !newTopic.number_of_lectures) {
      alert("Please fill out all topic fields.");
      return;
    }
    
    const chapter = chapters[selectedChapterIndex];
    const chapterId = chapter.id;
    const token = getAuthToken();
    if (!token) return;

    // Construct the topic data
    const topicData = {
      chapter_id: chapterId,
      name: newTopic.name,
      description: newTopic.description,
      number_of_lectures: parseInt(newTopic.number_of_lectures, 10),
      Status: "Incomplete",
    };

    try {
      const response = await fetch("http://localhost:5000/topic", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}` 
        },
        body: JSON.stringify(topicData),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to add topic: ${response.status}`);
      }

      // Get the added topic from the response
      const addedTopic = await response.json();

      // Update the chapter's topics array
      const updatedChapters = [...chapters];
      updatedChapters[selectedChapterIndex].topics = [
        ...(updatedChapters[selectedChapterIndex].topics || []),
        addedTopic
      ];
      setChapters(updatedChapters);

      // Reset the form
      setNewTopic({ name: "", description: "", number_of_lectures: "" });
      
      alert("Topic added successfully!");
    } catch (error) {
      console.error("Error adding topic:", error);
      alert(`An error occurred while adding the topic: ${error.message}`);
    }
  };

  // Handle deleting a topic
  const deleteTopic = async (chapterIndex, topicIndex) => {
    const topicId = chapters[chapterIndex].topics[topicIndex].id;
    const token = getAuthToken();
    if (!token) return;
    
    try {
      const response = await fetch(`http://localhost:5000/topic/${topicId}`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to delete topic: ${response.status}`);
      }
      
      const updatedChapters = [...chapters];
      updatedChapters[chapterIndex].topics = updatedChapters[chapterIndex].topics.filter(
        (_, i) => i !== topicIndex
      );
      setChapters(updatedChapters);
      alert("Topic deleted successfully!");
    } catch (error) {
      console.error("Error deleting topic:", error);
      alert(`An error occurred while deleting the topic: ${error.message}`);
    }
  };

  // Handle editing a topic
  const startEditingTopic = (chapterIndex, topicIndex) => {
    setEditingTopicIndex(topicIndex);
    setEditTopic({ ...chapters[chapterIndex].topics[topicIndex] });
  };

  const saveEditedTopic = async (chapterIndex) => {
    if (!editTopic.name.trim() || !editTopic.description.trim()) {
      alert("Topic name and description cannot be empty");
      return;
    }
    
    const topicId = chapters[chapterIndex].topics[editingTopicIndex].id;
    const token = getAuthToken();
    if (!token) return;
    
    try {
      const updateData = {
        name: editTopic.name,
        description: editTopic.description,
        number_of_lectures: parseInt(editTopic.number_of_lectures, 10),
        Status: editTopic.Status
      };
      
      const response = await fetch(`http://localhost:5000/topic/${topicId}`, {
        method: "PUT",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify(updateData),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to update topic: ${response.status}`);
      }
      
      const updatedChapters = [...chapters];
      updatedChapters[chapterIndex].topics[editingTopicIndex] = { ...editTopic };
      setChapters(updatedChapters);
      setEditingTopicIndex(null);
      setEditTopic(null);
      alert("Topic updated successfully!");
    } catch (error) {
      console.error("Error updating topic:", error);
      alert(`Error updating topic: ${error.message}`);
    }
  };

  const cancelEditTopic = () => {
    setEditingTopicIndex(null);
    setEditTopic(null);
  };

  // Handle input changes for chapters and topics
  const handleChapterInputChange = (e) => {
    const { name, value } = e.target;
    setNewChapter({ ...newChapter, [name]: value });
  };

  const handleEditChapterInputChange = (e) => {
    const { name, value } = e.target;
    setEditChapter({ ...editChapter, [name]: value });
  };

  const handleTopicInputChange = (e) => {
    const { name, value } = e.target;
    setNewTopic({ ...newTopic, [name]: value });
  };

  const handleEditTopicInputChange = (e) => {
    const { name, value } = e.target;
    setEditTopic({ ...editTopic, [name]: value });
  };

  const toggleTopicStatus = async (chapterIndex, topicIndex, currentStatus) => {
    const topicId = chapters[chapterIndex].topics[topicIndex].id;
    const newStatus = currentStatus === "Incomplete" ? "Completed" : "Incomplete";
    const token = getAuthToken();
    if (!token) return;
  
    try {
      const response = await fetch(`http://localhost:5000/topic/${topicId}/status`, {
        method: "PUT",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ Status: newStatus }),
      });
  
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to update topic status: ${response.status}`);
      }
  
      // Update the topic's status locally
      const updatedChapters = [...chapters];
      updatedChapters[chapterIndex].topics[topicIndex].Status = newStatus;
      setChapters(updatedChapters);
  
      alert(`Topic marked as ${newStatus}`);
    } catch (error) {
      console.error("Error updating topic status:", error);
      alert(`An error occurred while updating the topic status: ${error.message}`);
    }
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div style={{ padding: "20px", fontFamily: "Arial, sans-serif" }}>
      <h1 style={{ textAlign: "center", color: "purple" }}>ClassLog</h1>
      <h3 style={{ textAlign: "center" }}>Subject Course Outline</h3>

      {/* Add Chapter */}
      <div style={{ marginBottom: "20px" }}>
        <input
          type="text"
          name="name"
          placeholder="Chapter Name"
          value={newChapter.name}
          onChange={handleChapterInputChange}
          style={{ marginRight: "10px" }}
        />
        <input
          type="number"
          name="total_lectures"
          placeholder="Chapter Number"
          value={newChapter.total_lectures}
          onChange={handleChapterInputChange}
          style={{ marginRight: "10px" }}
        />
        <button
          onClick={addChapter}
          style={{ padding: "10px", backgroundColor: "purple", color: "white", border: "none" }}
        >
          Add Chapter
        </button>
      </div>

      {/* Chapters */}
      {chapters.map((chapter, chapterIndex) => (
        <div key={chapter.id} style={{ marginBottom: "20px", border: "1px solid #ddd", padding: "10px" }}>
          {editingChapterIndex === chapterIndex ? (
            <div>
              <input
                type="text"
                name="name"
                placeholder="Chapter Name"
                value={editChapter.name}
                onChange={handleEditChapterInputChange}
                style={{ marginRight: "10px" }}
              />
              <input
                type="number"
                name="total_lectures"
                placeholder="Total Lectures"
                value={editChapter.total_lectures || editChapter.number_of_lectures}
                onChange={handleEditChapterInputChange}
                style={{ marginRight: "10px" }}
              />
              <button onClick={saveEditedChapter} style={{ marginRight: "10px" }}>
                Save
              </button>
              <button onClick={cancelEditChapter}>Cancel</button>
            </div>
          ) : (
            <div>
              <h4
                onClick={() => selectChapter(chapterIndex)}
                style={{ cursor: "pointer", display: "inline-block", marginRight: "20px" }}
              >
                {chapter.name} ({chapter.total_lectures || chapter.number_of_lectures} Lectures)
              </h4>
              <button onClick={() => startEditingChapter(chapterIndex)} style={{ marginRight: "10px" }}>
                Edit
              </button>
              <button onClick={() => deleteChapter(chapterIndex)}>Delete</button>
            </div>
          )}

          {/* Topics */}
          {selectedChapterIndex === chapterIndex && (
            <div>
              <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "20px" }}>
                <thead>
                  <tr style={{ backgroundColor: "#f2f2f2", textAlign: "left" }}>
                    <th style={{ padding: "10px", border: "1px solid #ddd" }}>Topic Name</th>
                    <th style={{ padding: "10px", border: "1px solid #ddd" }}>Description</th>
                    <th style={{ padding: "10px", border: "1px solid #ddd" }}>Topic Number</th>
                    <th style={{ padding: "10px", border: "1px solid #ddd" }}>Status</th>
                    <th style={{ padding: "10px", border: "1px solid #ddd" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {chapter.topics && chapter.topics.length > 0 ? (
                    chapter.topics.map((topic, topicIndex) => (
                      <tr key={topic.id}>
                        <td style={{ padding: "8px", border: "1px solid #ddd" }}>{topic.name}</td>
                        <td style={{ padding: "8px", border: "1px solid #ddd" }}>{topic.description}</td>
                        <td style={{ padding: "8px", border: "1px solid #ddd" }}>{topic.number_of_lectures}</td>
                        <td style={{ padding: "8px", border: "1px solid #ddd" }}>{topic.Status}</td>
                        <td style={{ padding: "8px", border: "1px solid #ddd" }}>
                          <button
                            onClick={() => startEditingTopic(chapterIndex, topicIndex)}
                            style={{ marginRight: "5px", backgroundColor: "blue", color: "white", border: "none", padding: "5px 10px" }}
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => deleteTopic(chapterIndex, topicIndex)}
                            style={{ marginRight: "5px", backgroundColor: "red", color: "white", border: "none", padding: "5px 10px" }}
                          >
                            Delete
                          </button>
                          <button
                            onClick={() => toggleTopicStatus(chapterIndex, topicIndex, topic.Status)}
                            style={{
                              backgroundColor: topic.Status === "Incomplete" ? "green" : "orange",
                              color: "white",
                              border: "none",
                              padding: "5px 10px",
                            }}
                          >
                            {topic.Status === "Incomplete" ? "Mark as Completed" : "Mark as Incomplete"}
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="5" style={{ textAlign: "center", padding: "10px" }}>
                        No topics found. Add a topic below.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              {/* Add Topic Form */}
              <div>
                <input
                  type="text"
                  name="name"
                  placeholder="Topic Name"
                  value={newTopic.name}
                  onChange={handleTopicInputChange}
                  style={{ marginRight: "10px" }}
                />
                <input
                  type="text"
                  name="description"
                  placeholder="Description"
                  value={newTopic.description}
                  onChange={handleTopicInputChange}
                  style={{ marginRight: "10px" }}
                />
                <input
                  type="number"
                  name="number_of_lectures"
                  placeholder="Topic Number"
                  value={newTopic.number_of_lectures}
                  onChange={handleTopicInputChange}
                  style={{ marginRight: "10px" }}
                />
                <button
                  onClick={addTopicToChapter}
                  style={{ padding: "10px", backgroundColor: "purple", color: "white", border: "none" }}
                >
                  Add Topic
                </button>
              </div>

              {/* Topic Editing Modal */}
              {editingTopicIndex !== null && (
                <div style={{ marginTop: "20px", padding: "15px", border: "1px solid #ddd", backgroundColor: "#f9f9f9" }}>
                  <h4>Edit Topic</h4>
                  <input
                    type="text"
                    name="name"
                    placeholder="Topic Name"
                    value={editTopic.name}
                    onChange={handleEditTopicInputChange}
                    style={{ marginRight: "10px", marginBottom: "10px", display: "block", width: "100%" }}
                  />
                  <input
                    type="text"
                    name="description"
                    placeholder="Description"
                    value={editTopic.description}
                    onChange={handleEditTopicInputChange}
                    style={{ marginRight: "10px", marginBottom: "10px", display: "block", width: "100%" }}
                  />
                  <input
                    type="number"
                    name="number_of_lectures"
                    placeholder="Number of Lectures"
                    value={editTopic.number_of_lectures}
                    onChange={handleEditTopicInputChange}
                    style={{ marginRight: "10px", marginBottom: "10px", display: "block", width: "100%" }}
                  />
                  <button
                    onClick={() => saveEditedTopic(chapterIndex)}
                    style={{ marginRight: "10px", backgroundColor: "green", color: "white", border: "none", padding: "5px 10px" }}
                  >
                    Save
                  </button>
                  <button
                    onClick={cancelEditTopic}
                    style={{ backgroundColor: "gray", color: "white", border: "none", padding: "5px 10px" }}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      ))}

      {/* Lecture Navigation */}
      <div style={{ marginTop: "20px" }}>
        <h3>Lecture Navigation</h3>
        <div>
          {lectures.map((lecture) => (
            <button
              key={lecture.id}
              onClick={() => goToLecturePlan(lecture.id)}
              style={{
                padding: "10px 20px",
                margin: "5px",
                backgroundColor: "purple",
                color: "white",
                border: "none",
                borderRadius: "5px",
                cursor: "pointer",
              }}
            >
              Lecture {lecture.lecture_number}
            </button>
          ))}
        </div>
        {/* Add Lecture Form */}
        <div style={{ marginTop: "10px" }}>
          <input
            type="number"
            name="lecture_number"
            placeholder="Lecture Number"
            value={newLectureNumber}
            onChange={(e) => setNewLectureNumber(e.target.value)}
            style={{ marginRight: "10px" }}
          />
          <button
            onClick={addLecture}
            style={{
              padding: "10px",
              backgroundColor: "green",
              color: "white",
              border: "none",
              borderRadius: "5px",
            }}
          >
            Add Lecture
          </button>
        </div>
      </div>
    </div>
  );
};

export default CourseOutline;