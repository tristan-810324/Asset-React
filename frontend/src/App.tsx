import Login from './auth/login'
import Register from './auth/register'
import ForgotPassword from './auth/forgotpassword'
import ResetOtp from './auth/resetotp'
import ResetPassword from './auth/resetpassword'
import Hero from './landing/hero'

export default function App() {
  const path = window.location.pathname

  if (path === '/login' && window.location.hash === '#forgot-password') return <ForgotPassword />
  if (path === '/login') return <Login />
  if (path === '/register') return <Register />
  if (path === '/forgot-password') return <ForgotPassword />
  if (path === '/reset-otp') return <ResetOtp />
  if (path === '/reset-password') return <ResetPassword />

  return <Hero />
}
