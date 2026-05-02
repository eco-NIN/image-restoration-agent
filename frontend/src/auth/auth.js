const TOKEN_KEY = 'auth_token'
const USER_KEY = 'auth_username'

export function getToken() {
  return window.localStorage.getItem(TOKEN_KEY) || ''
}

export function getUsername() {
  return window.localStorage.getItem(USER_KEY) || ''
}

export function isAuthenticated() {
  return Boolean(getToken())
}

export function setAuthSession({ token, username }) {
  if (token) window.localStorage.setItem(TOKEN_KEY, token)
  if (username) window.localStorage.setItem(USER_KEY, username)
}

export function clearAuthSession() {
  window.localStorage.removeItem(TOKEN_KEY)
  window.localStorage.removeItem(USER_KEY)
}
