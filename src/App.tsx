/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import { subscribeUserEnrollments } from './services/enrollmentService';
import PushNotificationPrompt from './components/PushNotificationPrompt';
import Login from './pages/Login';
import StudentDirectory from './pages/StudentDirectory';
import VideoLibrary from './pages/VideoLibrary';
import StudentPortal from './pages/StudentPortal';
import PendingSubscription from './pages/PendingSubscription';
import SalesPage from './pages/SalesPage';
import Checkout from './pages/Checkout';
import PurchaseConfirmation from './pages/PurchaseConfirmation';
import Dashboard from './pages/Dashboard';
import ContentManager from './pages/ContentManager';
import Analytics from './pages/Analytics';
import PushBroadcastManager from './pages/PushBroadcastManager';
import ProducerMessages from './pages/ProducerMessages';
import Settings from './pages/Settings';
import Terms from './pages/Terms';
import Privacy from './pages/Privacy';
import { syncUserDeviceStatus, validateAndRegisterDevice } from './utils/deviceDetection';
import { isMasterEmail } from './utils/constants';
import DeviceLimitModal from './components/DeviceLimitModal';
import { RegisteredDevice } from './types';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [deviceLock, setDeviceLock] = useState<{
    blocked: boolean;
    devices: RegisteredDevice[];
    deviceName: string;
  } | null>(null);
  const [viewAsStudent, setViewAsStudent] = useState(() => {
    return localStorage.getItem('viewAsStudent') === 'true';
  });

  useEffect(() => {
    const handleToggle = () => {
      setViewAsStudent(localStorage.getItem('viewAsStudent') === 'true');
    };
    window.addEventListener('student-view-changed', handleToggle);
    return () => window.removeEventListener('student-view-changed', handleToggle);
  }, []);



  const isAdminEmail = isMasterEmail(userProfile?.email) || isMasterEmail(user?.email);
  const isReallyAdmin = userProfile?.role === 'admin' || userProfile?.role === 'producer' || isAdminEmail;
  const effectiveRole = (isReallyAdmin && viewAsStudent) ? 'student' : (isReallyAdmin ? 'admin' : userProfile?.role);
  const effectiveStatus = (isReallyAdmin && viewAsStudent) ? 'active' : (isReallyAdmin ? 'active' : userProfile?.subscriptionStatus);

  const checkDevice = async (uid: string, email?: string | null) => {
    const isMaster = isMasterEmail(email);
    const result = await validateAndRegisterDevice(uid, isMaster);
    if (!result.allowed) {
      setDeviceLock({
        blocked: true,
        devices: result.registeredDevices,
        deviceName: result.currentDeviceName
      });
    } else {
      setDeviceLock(null);
    }
  };

  useEffect(() => {
    let unsubscribeProfile: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);

      if (unsubscribeProfile) {
        unsubscribeProfile();
        unsubscribeProfile = null;
      }

      if (currentUser) {
        syncUserDeviceStatus(currentUser.uid);
        checkDevice(currentUser.uid, currentUser.email);
        unsubscribeProfile = subscribeUserEnrollments(currentUser, (enrollData) => {
          const isMaster = isMasterEmail(currentUser.email);
          let baseProfile = enrollData.userProfile || {};

          if (isMaster) {
            baseProfile = {
              ...baseProfile,
              uid: currentUser.uid,
              email: currentUser.email,
              role: 'admin',
              roleType: 'admin',
              subscriptionStatus: 'active'
            };
          }

          setUserProfile({
            ...baseProfile,
            enrolledCourses: enrollData.enrolledCourses,
            completedLessons: enrollData.completedLessons,
            subscriptionStatus: isMaster ? 'active' : (baseProfile.subscriptionStatus || enrollData.subscriptionStatus)
          });
          setLoading(false);
        });
      } else {
        setUserProfile(null);
        setDeviceLock(null);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeProfile) unsubscribeProfile();
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      {user && <PushNotificationPrompt />}
      {deviceLock?.blocked && user && (
        <DeviceLimitModal
          userId={user.uid}
          registeredDevices={deviceLock.devices}
          currentDeviceName={deviceLock.deviceName}
          onDeviceRegistered={() => checkDevice(user.uid, user.email)}
        />
      )}
      <div className="min-h-screen w-full max-w-full overflow-x-hidden">
        <Routes>
          <Route path="/" element={<SalesPage />} />
          
          <Route 
            path="/entrar" 
            element={
              !user ? <Login /> : (
                (effectiveRole === 'admin' || effectiveRole === 'producer') ? (
                  (effectiveStatus === 'pending_approval' || (userProfile?.isApproved === false && !isAdminEmail))
                    ? <Navigate to="/pending" replace />
                    : <Navigate to="/dashboard" replace />
                ) : (
                  <Navigate to="/library" replace />
                )
              )
            } 
          />
          
          <Route 
            path="/criar-conta" 
            element={
              !user ? <Login /> : (
                (effectiveRole === 'admin' || effectiveRole === 'producer') ? (
                  (effectiveStatus === 'pending_approval' || (userProfile?.isApproved === false && !isAdminEmail))
                    ? <Navigate to="/pending" replace />
                    : <Navigate to="/dashboard" replace />
                ) : (
                  <Navigate to="/library" replace />
                )
              )
            } 
          />

          <Route path="/checkout" element={<Checkout />} />
          <Route path="/confirmation" element={<PurchaseConfirmation />} />
          
          <Route 
            path="/dashboard" 
            element={user && (effectiveRole === 'admin' || effectiveRole === 'producer') ? <Dashboard /> : <Navigate to="/" replace />} 
          />
          <Route 
            path="/directory" 
            element={user && (effectiveRole === 'admin' || effectiveRole === 'producer') ? <StudentDirectory /> : <Navigate to="/" replace />} 
          />
          <Route 
            path="/content" 
            element={user && (effectiveRole === 'admin' || effectiveRole === 'producer') ? <ContentManager /> : <Navigate to="/" replace />} 
          />
          <Route 
            path="/analytics" 
            element={user && (effectiveRole === 'admin' || effectiveRole === 'producer') ? <Analytics /> : <Navigate to="/" replace />} 
          />
          <Route 
            path="/broadcast" 
            element={user && isAdminEmail && effectiveRole !== 'student' ? <PushBroadcastManager /> : <Navigate to="/" replace />} 
          />
          <Route 
            path="/messages" 
            element={user && (effectiveRole === 'admin' || effectiveRole === 'producer') ? <ProducerMessages /> : <Navigate to="/" replace />} 
          />
          <Route 
            path="/settings" 
            element={user && (effectiveRole === 'admin' || effectiveRole === 'producer') ? <Settings /> : <Navigate to="/" replace />} 
          />
          
          <Route 
            path="/library" 
            element={<StudentPortal />} 
          />
          <Route 
            path="/library/:slug" 
            element={<StudentPortal />} 
          />
          <Route 
            path="/portal" 
            element={<StudentPortal />} 
          />
          <Route 
            path="/my-courses" 
            element={<Navigate to="/library/meus-cursos" replace />} 
          />
          <Route 
            path="/meus-cursos" 
            element={<Navigate to="/library/meus-cursos" replace />} 
          />
          <Route 
            path="/classroom" 
            element={user ? <VideoLibrary /> : <Navigate to="/entrar" replace />} 
          />
          <Route 
            path="/pending" 
            element={
              user ? (
                ((effectiveRole === 'admin' || effectiveRole === 'producer') && (effectiveStatus === 'pending_approval' || userProfile?.isApproved === false && !isAdminEmail)) 
                  ? <PendingSubscription /> 
                  : <Navigate to="/entrar" replace />
              ) : <Navigate to="/entrar" replace />
            } 
          />
          <Route path="/termos" element={<Terms />} />
          <Route path="/privacidade" element={<Privacy />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
