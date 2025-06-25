// src/components/ui/card.js
import React from 'react';

// Card container component
export const Card = ({ children, className = '' }) => (
  <div className={`p-4 rounded-lg shadow ${className}`}>{children}</div>
);

// CardHeader component to display header section of the card
export const CardHeader = ({ children, className = '' }) => (
  <div className={`border-b border-gray-200 p-4 flex justify-between items-center ${className}`}>
    {children}
  </div>
);

// CardTitle component for the card title
export const CardTitle = ({ children, className = '' }) => (
  <h2 className={`text-xl font-semibold ${className}`}>{children}</h2>
);

// CardContent component for main content area
export const CardContent = ({ children, className = '' }) => (
  <div className={`p-4 ${className}`}>{children}</div>
);
