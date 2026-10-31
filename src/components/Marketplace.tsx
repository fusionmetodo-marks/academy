import React from 'react';
import StudentCatalog, { Course, StudentCatalogProps } from './StudentCatalog';

export type { Course as MarketplaceCourse, StudentCatalogProps };

export default function Marketplace({ onSelectCourse }: { onSelectCourse: (course: Course) => void }) {
  return <StudentCatalog onSelectCourse={onSelectCourse} />;
}
