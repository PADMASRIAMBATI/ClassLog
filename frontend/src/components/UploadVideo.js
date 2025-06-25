import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import "./UploadVideo.css";

const UploadVideo = () => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [responseMessage, setResponseMessage] = useState(null);
  const [streamedTranscript, setStreamedTranscript] = useState("");
  const [completedTopics, setCompletedTopics] = useState([]);
  const [revisionTopics, setRevisionTopics] = useState([]);
  const [completedQuestions, setCompletedQuestions] = useState([]);
  const [revisionQuestions, setRevisionQuestions] = useState([]);
  const [questionResults, setQuestionResults] = useState({});
  const [isDataFetched, setIsDataFetched] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [processingStage, setProcessingStage] = useState(null);
  const [error, setError] = useState(null);
  const [processingStatus, setProcessingStatus] = useState(null);
  
  // Language handling state
  const [preferredLanguage, setPreferredLanguage] = useState("english");
  const [displayLanguage, setDisplayLanguage] = useState("english");
  const [downloadLanguage, setDownloadLanguage] = useState("english");
  const [availableLanguages, setAvailableLanguages] = useState(["english"]);
  const [supportedLanguages, setSupportedLanguages] = useState(["english", "hindi", "telugu"]);
  const [translationStatus, setTranslationStatus] = useState({});
  
  // Get lecture ID from URL params
  const { lectureId } = useParams();
  const navigate = useNavigate();

  // API base URL - adjust to match your backend deployment
  const API_BASE_URL = "http://127.0.0.1:5000";

  // Get JWT token from localStorage
  const getToken = () => {
    return localStorage.getItem('token');
  };

  // Headers for authenticated requests
  const getAuthHeaders = (contentType = 'application/json') => {
    const headers = {
      'Authorization': `Bearer ${getToken()}`
    };
    
    if (contentType) {
      headers['Content-Type'] = contentType;
    }
    
    return headers;
  };

  // Fetch existing data when component loads
  useEffect(() => {
    if (lectureId) {
      fetchAvailableLanguages();
      fetchTranscriptAndResults();
      // Start polling for processing status if not already fetched
      pollForProcessing(lectureId);
    }
  }, [lectureId]);

  // Watch for display language changes to fetch transcript in that language
  useEffect(() => {
    if (lectureId && displayLanguage) {
      fetchTranscriptInLanguage(displayLanguage);
    }
  }, [lectureId, displayLanguage]);

  const fetchAvailableLanguages = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/translations?lecture_id=${lectureId}`, {
        headers: getAuthHeaders()
      });
      
      if (response.ok) {
        const data = await response.json();
        setAvailableLanguages(data.available_languages || ["english"]);
        setSupportedLanguages(data.supported_languages || ["english", "hindi", "telugu"]);
      }
    } catch (error) {
      console.error("Error fetching available languages:", error);
    }
  };

  const fetchTranscriptInLanguage = async (language) => {
    try {
      // Check if translation is available or in progress
      if (language !== "english" && !availableLanguages.includes(language)) {
        // Check translation status first
        const statusResponse = await fetch(`${API_BASE_URL}/translation-status/${lectureId}?language=${language}`, {
          headers: getAuthHeaders()
        });
        
        if (statusResponse.ok) {
          const status = await statusResponse.json();
          setTranslationStatus(prev => ({ ...prev, [language]: status }));
          
          if (status.status === "not_started") {
            // Request translation
            await requestTranslation(language);
            pollForTranslation(language);
            return;
          } else if (status.status === "processing") {
            // Translation is in progress, start polling
            pollForTranslation(language);
            return;
          }
        }
      }
      
      // Fetch transcript in the requested language
      const response = await fetch(`${API_BASE_URL}/transcript/${lectureId}?language=${language}`, {
        headers: getAuthHeaders()
      });
      
      if (response.ok) {
        const text = await response.text();
        setStreamedTranscript(text);
      } else {
        setStreamedTranscript(`Transcript in ${language.charAt(0).toUpperCase() + language.slice(1)} is unavailable.`);
      }
    } catch (error) {
      console.error(`Error fetching transcript in ${language}:`, error);
      setError(`Failed to load transcript in ${language}`);
    }
  };

  const requestTranslation = async (language) => {
    try {
      const response = await fetch(`${API_BASE_URL}/translate`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          lecture_id: lectureId,
          language: language
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        setTranslationStatus(prev => ({ ...prev, [language]: { status: "processing" } }));
        setResponseMessage(`Translation to ${language} has been initiated`);
        return true;
      }
    } catch (error) {
      console.error(`Error requesting translation to ${language}:`, error);
      setError(`Failed to request translation to ${language}`);
    }
    return false;
  };

  const pollForTranslation = async (language) => {
    let attempts = 0;
    const maxAttempts = 60; // Poll for up to 10 minutes (60 * 10 seconds)
    
    const checkStatus = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/translation-status/${lectureId}?language=${language}`, {
          headers: getAuthHeaders()
        });
        
        if (response.ok) {
          const status = await response.json();
          setTranslationStatus(prev => ({ ...prev, [language]: status }));
          
          if (status.status === "completed") {
            // Translation is done, update available languages and fetch transcript
            fetchAvailableLanguages();
            fetchTranscriptInLanguage(language);
            return true;
          } else if (status.status === "error") {
            setError(`Translation to ${language} failed: ${status.error || "Unknown error"}`);
            return true;
          }
        }
      } catch (error) {
        console.error("Error checking translation status:", error);
      }
      return false;
    };
    
    const poll = async () => {
      if (attempts >= maxAttempts) {
        setError(`Translation to ${language} timed out. Please try again later.`);
        return;
      }
      
      const done = await checkStatus();
      if (!done) {
        attempts++;
        setTimeout(poll, 10000); // Check every 10 seconds
      }
    };
    
    poll();
  };

  const fetchTranscriptAndResults = async () => {
    try {
      // Try to fetch transcript in preferred language
      await fetchTranscriptInLanguage(preferredLanguage);
      setIsDataFetched(true);
        
      // If transcript exists, also try to fetch results
      try {
        const resultsResponse = await fetch(`${API_BASE_URL}/results/${lectureId}`, {
          headers: getAuthHeaders()
        });
        
        if (resultsResponse.ok) {
          const results = await resultsResponse.json();
          
          // Update with results data from backend
          setCompletedTopics(results.topics_completed || []);
          setRevisionTopics(results.topics_for_revision || []);
          setCompletedQuestions(results.questions_completed || []);
          setRevisionQuestions(results.questions_for_revision || []);
          setQuestionResults(results.question_results || {});
        }
      } catch (error) {
        console.log("Results not available yet");
      }
    } catch (error) {
      console.log("No existing data found for this lecture");
    }
  };

  const handleFileChange = async (event) => {
    const videoFile = event.target.files[0];
    if (!videoFile) return;
    
    setIsProcessing(true);
    setProcessingStage("Uploading video");
    setError(null);
    
    try {
      const formData = new FormData();
      formData.append("video", videoFile);
      formData.append("language", preferredLanguage); // Add preferred language
      
      console.log("Uploading file:", videoFile.name, "Size:", videoFile.size);
      
      // Generate a new lecture ID if one doesn't exist
      let uploadUrl = `${API_BASE_URL}/upload`;
      if (lectureId) {
        uploadUrl = `${API_BASE_URL}/upload/${lectureId}`;
      }
      
      // Send POST request to backend with JWT authentication
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          'Authorization': `Bearer ${getToken()}`
          // Note: Don't set Content-Type for FormData as browser will set it with boundary
        },
        body: formData,
      });
      
      console.log("Upload response status:", response.status);
      
      if (!response.ok) {
        const errorData = await response.text();
        console.error("Upload error:", errorData);
        throw new Error(`Error ${response.status}: ${errorData || response.statusText}`);
      }
      
      const data = await response.json();
      console.log("Upload response data:", data);
      
      setResponseMessage(data.message || "Video upload successful. Processing started.");
      
      // Start polling for processing status and stay on this page
      if (data.lecture_id) {
        // If we're not already on the correct page, navigate there
        if (!lectureId) {
          navigate(`/upload/${data.lecture_id}`, { replace: true });
        }
        pollForProcessing(data.lecture_id);
      }
      
    } catch (error) {
      console.error("Error uploading video:", error);
      setError(error.message);
      setResponseMessage("Failed to upload video. Please try again.");
      setIsProcessing(false);
    }
  };

  const pollForProcessing = async (id) => {
    let attempts = 0;
    const maxAttempts = 120; // Poll for up to 20 minutes (120 * 10 seconds)
    
    const checkStatus = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/status/${id}`, {
          headers: getAuthHeaders()
        });
        
        if (response.ok) {
          const status = await response.json();
          setProcessingStatus(status);
          
          // Format processing stage for display (replace underscores with spaces)
          setProcessingStage(status.stage ? status.stage.replace(/_/g, " ") : "preparing");
          setUploadProgress(status.progress || 0);
          
          // Update preferred language based on what was set during processing
          if (status.preferred_language) {
            setPreferredLanguage(status.preferred_language);
            setDisplayLanguage(status.preferred_language);
            setDownloadLanguage(status.preferred_language);
          }
          
          if (status.status === "completed") {
            // Processing is done, fetch transcript and results
            fetchAvailableLanguages();
            fetchTranscriptAndResults();
            setIsProcessing(false);
            return true;
          } else if (status.status === "error") {
            // Handle error
            setError(status.error || "Processing failed");
            setIsProcessing(false);
            return true;
          } else if (status.status === "processing") {
            // Still processing, continue polling
            return false;
          }
        }
      } catch (error) {
        console.log("Error checking status:", error);
      }
      return false;
    };
    
    const poll = async () => {
      if (attempts >= maxAttempts) {
        setError("Processing timed out. Please check back later.");
        setIsProcessing(false);
        return;
      }
      
      const done = await checkStatus();
      if (!done) {
        attempts++;
        setTimeout(poll, 10000); // Check every 10 seconds
      }
    };
    
    poll();
  };

  const renderQuestionDetails = (question) => {
    const result = questionResults[question];
    if (!result) return null;
    
    const total = result.yes + result.no + result.not_answered;
    
    return (
      <div className="question-details">
        <div className="response-bar">
          <div 
            className="yes-bar" 
            style={{width: `${(result.yes / total) * 100}%`}}
            title={`Yes: ${result.yes} responses`}
          >
            Yes: {result.yes}
          </div>
          <div 
            className="no-bar" 
            style={{width: `${(result.no / total) * 100}%`}}
            title={`No: ${result.no} responses`}
          >
            No: {result.no}
          </div>
          <div 
            className="na-bar" 
            style={{width: `${(result.not_answered / total) * 100}%`}}
            title={`Not Answered: ${result.not_answered} students`}
          >
            N/A: {result.not_answered}
          </div>
        </div>
      </div>
    );
  };

  // Download transcript as PDF in selected language
  const downloadTranscript = () => {
    if (!lectureId) return;
    
    const downloadUrl = `${API_BASE_URL}/transcript/${lectureId}/download?language=english`;
    
    // Create a temporary anchor element and trigger the download
    fetch(downloadUrl, {
      method: 'GET',
      headers: getAuthHeaders(),
    })
    .then(response => {
      if (!response.ok) {
        return response.text().then(text => {
          throw new Error(`Failed to download transcript: ${response.statusText} - ${text}`);
        });
      }
      return response.blob();
    })
    .then(blob => {
      const url = window.URL.createObjectURL(blob);
      const downloadLink = document.createElement('a');
      downloadLink.href = url;
      downloadLink.setAttribute('download', `transcript_${lectureId}_${downloadLanguage}.pdf`);
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      window.URL.revokeObjectURL(url);
    })
    .catch(error => {
      console.error('Download error:', error);
      setError(`Failed to download transcript: ${error.message}`);
    });
  };

  // Handle language change for displaying transcript
  const handleDisplayLanguageChange = (e) => {
    const newLanguage = e.target.value;
    setDisplayLanguage(newLanguage);
  };

  // Handle language change for download preference
  const handleDownloadLanguageChange = (e) => {
    setDownloadLanguage(e.target.value);
  };

  // Handle language change for upload preference
  const handlePreferredLanguageChange = (e) => {
    setPreferredLanguage(e.target.value);
  };

  // Initialize translation for a language
  const handleRequestTranslation = async () => {
    if (!availableLanguages.includes(displayLanguage) && displayLanguage !== "english") {
      await requestTranslation(displayLanguage);
      pollForTranslation(displayLanguage);
    }
  };

  // Render translation status
  const renderTranslationStatus = (language) => {
    const status = translationStatus[language];
    if (!status) return null;
    
    if (status.status === "processing") {
      return (
        <div className="translation-progress">
          <p>Translation in progress...</p>
          {status.progress && (
            <div className="progress-bar">
              <div 
                className="progress-fill"
                style={{width: `${status.progress}%`}}
              ></div>
              <span>{status.progress}%</span>
            </div>
          )}
        </div>
      );
    } else if (status.status === "error") {
      return (
        <div className="translation-error">
          <p>Translation failed: {status.error || "Unknown error"}</p>
        </div>
      );
    }
    
    return null;
  };
  
  return (
    <div className="upload-container">
      <h1>Video Upload & Processing</h1>

      {error && (
        <div className="error-message">
          <p>{error}</p>
        </div>
      )}

      {responseMessage && (
        <div className="response-message">
          <p>{responseMessage}</p>
        </div>
      )}

      {/* File upload section */}
      <div className="upload-section">
        <h2>Upload Lecture Video</h2>
        <div className="language-selector">
          <label htmlFor="preferredLanguage">Preferred Language:</label>
          <select 
            id="preferredLanguage" 
            value={preferredLanguage} 
            onChange={handlePreferredLanguageChange}
            disabled={isProcessing}
          >
            {supportedLanguages.map(lang => (
              <option key={lang} value={lang}>{lang.charAt(0).toUpperCase() + lang.slice(1)}</option>
            ))}
          </select>
        </div>
        
        <input 
          type="file" 
          accept="video/*" 
          onChange={handleFileChange} 
          disabled={isProcessing}
        />
      </div>

      {/* Processing status section */}
      {isProcessing && (
        <div className="processing-status">
          <h3>Processing Status: {processingStage}</h3>
          <div className="progress-bar">
            <div 
              className="progress-fill"
              style={{width: `${uploadProgress}%`}}
            ></div>
          </div>
          <p>{uploadProgress}% complete</p>
        </div>
      )}

      {/* Transcript Section */}
      {isDataFetched && (
        <div className="transcript-section">
          <h2>Lecture Transcript</h2>
          
          <div className="transcript-controls">
            <div className="language-selector">
              <label htmlFor="displayLanguage">Display Language:</label>
              <select 
                id="displayLanguage" 
                value={displayLanguage} 
                onChange={handleDisplayLanguageChange}
              >
                {supportedLanguages.map(lang => (
                  <option 
                    key={lang} 
                    value={lang}
                    disabled={!availableLanguages.includes(lang) && lang !== displayLanguage}
                  >
                    {lang.charAt(0).toUpperCase() + lang.slice(1)}
                    {!availableLanguages.includes(lang) && lang !== "english" ? " (unavailable)" : ""}
                  </option>
                ))}
              </select>
            </div>
            
            {!availableLanguages.includes(displayLanguage) && displayLanguage !== "english" && (
              <button 
                onClick={handleRequestTranslation}
                disabled={translationStatus[displayLanguage]?.status === "processing"}
              >
                {translationStatus[displayLanguage]?.status === "processing" 
                  ? "Translation in progress..." 
                  : `Translate to ${displayLanguage.charAt(0).toUpperCase() + displayLanguage.slice(1)}`}
              </button>
            )}
            
            <div className="download-controls">
              <div className="language-selector">
                
                
               
                
              </div>
              <button onClick={downloadTranscript}>
                Download Transcript
              </button>
            </div>
          </div>
          
          {renderTranslationStatus(displayLanguage)}
          
          <div className="transcript-content">
            <pre>{streamedTranscript}</pre>
          </div>
        </div>
      )}

      {/* Results Section */}
      {isDataFetched && completedTopics.length + revisionTopics.length > 0 && (
        <div className="results-section">
          <h2>Lecture Analysis</h2>
          
          <div className="topics-section">
            <div className="completed-topics">
              <h3>Topics Understood</h3>
              <ul>
                {completedTopics.map((topic, index) => (
                  <li key={`completed-${index}`}>{topic}</li>
                ))}
              </ul>
            </div>
            
            <div className="revision-topics">
              <h3>Topics Needing Revision</h3>
              <ul>
                {revisionTopics.map((topic, index) => (
                  <li key={`revision-${index}`}>{topic}</li>
                ))}
              </ul>
            </div>
          </div>
          
          <div className="questions-section">
            <h3>Question Results</h3>
            
            <div className="question-group">
              <h4>Questions Understood</h4>
              <ul>
                {completedQuestions.map((question, index) => (
                  <li key={`q-complete-${index}`}>
                    <div className="question-text">{question}</div>
                    {renderQuestionDetails(question)}
                  </li>
                ))}
              </ul>
            </div>
            
            <div className="question-group">
              <h4>Questions Needing Revision</h4>
              <ul>
                {revisionQuestions.map((question, index) => (
                  <li key={`q-revision-${index}`}>
                    <div className="question-text">{question}</div>
                    {renderQuestionDetails(question)}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UploadVideo;