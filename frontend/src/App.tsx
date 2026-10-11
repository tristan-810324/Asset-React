import Login from './auth/login'
import Hero from './landing/hero'

export default function App() {
  if (window.location.pathname === '/login') {
    return <Login />
  }

  return <Hero />
}