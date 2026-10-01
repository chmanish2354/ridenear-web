import { Navigate, Route, Routes } from 'react-router-dom';
import HomePage from './pages/Home';
import LoginPage from './pages/Login';
import MyTripsPage from './pages/MyTrips';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<HomePage />} />
      <Route path="/trips" element={<MyTripsPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
