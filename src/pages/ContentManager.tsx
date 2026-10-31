import React, { useState } from 'react';
import Sidebar from '../components/Sidebar';
import CoursesList from '../components/CoursesList';
import CourseEditor from '../components/CourseEditor';

export default function ContentManager() {
  const [viewMode, setViewMode] = useState<'list' | 'editor'>('list');
  const [selectedCourseId, setSelectedCourseId] = useState<string>('c1');

  const handleSelectCourse = (courseId: string) => {
    setSelectedCourseId(courseId);
    setViewMode('editor');
  };

  const handleBackToList = () => {
    setViewMode('list');
  };

  return (
    <div className="flex min-h-screen bg-[#0a0a0a] text-white">
      {/* Sidebar Navigation */}
      <Sidebar />

      {/* Main Workspace */}
      <main className="flex-1 overflow-y-auto min-h-screen relative lg:ml-72 ml-0 pt-16 lg:pt-0">
        {/* Subtle noise texture */}
        <div 
          className="fixed inset-0 pointer-events-none z-[1] opacity-[0.02]" 
          style={{ 
            backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noiseFilter\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.65\' numOctaves=\'3\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noiseFilter)\'/%3E%3C/svg%3E")' 
          }}
        />

        <div className="relative z-10">
          {viewMode === 'list' ? (
            <CoursesList onSelectCourse={handleSelectCourse} />
          ) : (
            <CourseEditor 
              courseId={selectedCourseId} 
              onBack={handleBackToList} 
            />
          )}
        </div>
      </main>
    </div>
  );
}
