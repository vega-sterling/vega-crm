// QA helper: mint an iron-session cookie for an existing user (no password needed).
import { getIronSession } from 'iron-session'

const [userId, email, name, globalRole] = process.argv.slice(2)
const sessionOptions = {
  cookieName: 'vega_crm_session',
  password: process.env.SESSION_SECRET,
  cookieOptions: { httpOnly: true, secure: true, sameSite: 'strict', maxAge: 86400, path: '/' },
}
// Next.js RequestCookies-compatible shim: get(name) -> {name,value}, getAll() -> [{name,value}], set(name,value)
const store = {}
const makeCookie = (name, value) => ({ name, value, get name() { return name }, set name(n) {}, get value() { return value }, set value(v) {} })
const cookieStore = {
  get: (name) => store[name] ? { name, value: store[name] } : undefined,
  getAll: () => Object.entries(store).map(([name, value]) => ({ name, value })),
  set: (name, value) => { store[name] = typeof value === 'object' && value !== null && 'value' in value ? value.value : value },
}
const session = await getIronSession(cookieStore, sessionOptions)
session.userId = userId
session.email = email
session.name = name
session.globalRole = globalRole
session.totpVerified = true
await session.save()
const v = store['vega_crm_session']
console.log(typeof v === 'string' ? 'vega_crm_session=' + v : 'FAILED:' + JSON.stringify(store))
