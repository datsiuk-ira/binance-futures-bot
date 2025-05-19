// frontend/src/App.tsx
import {Routes, Route, Navigate} from "react-router-dom";
import Login from "./pages/login";
import SignUp from "./pages/sign_up";
import Profile from "./pages/profile";
import PrivateRoute from "./componets/PrivateRoute";
import {ToastContainer} from 'react-toastify'; // Імпорт
import 'react-toastify/dist/ReactToastify.css'; // Імпорт стилів

function App() {
    return (
        <> {/* Обгортка для ToastContainer та Routes */}
            <ToastContainer position="top-right"
                            autoClose={5000}
                            hideProgressBar={false}
                            newestOnTop={false}
                            closeOnClick
                            rtl={false}
                            pauseOnFocusLoss
                            draggable
                            pauseOnHover
                            theme="colored" // Можна "light", "dark", або "colored"
            />
            <Routes>
                <Route path="/" element={<Navigate to="/login"/>}/>
                <Route path="/login" element={<Login/>}/>
                <Route path="/sign_up" element={<SignUp/>}/>
                <Route element={<PrivateRoute/>}>
                    <Route path="/profile" element={<Profile/>}/>
                </Route>
            </Routes>
        </>
    );
}

export default App;