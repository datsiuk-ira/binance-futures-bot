import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchProfile } from "../api/auth";

interface ProfileData {
  email: string;
  balance: string;
  leverage: number;
  risk_percentage: number;
  trade_mode: string;
}

export default function Profile() {
  const [data, setData] = useState<ProfileData | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/login");
      return;
    }
    fetchProfile(token)
      .then((res) => setData(res.data))
      .catch(() => navigate("/login"));
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("token");
    navigate("/login");
  };

  return data ? (
    <div style={{ maxWidth: 600, margin: "0 auto" }}>
      <h2>Welcome, {data.email}</h2>
      <p>Balance: {data.balance}</p>
      <p>Leverage: {data.leverage}</p>
      <p>Risk %: {data.risk_percentage}</p>
      <p>Trade Mode: {data.trade_mode}</p>
      <button onClick={handleLogout}>Logout</button>
    </div>
  ) : (
    <p>Loading...</p>
  );
}
