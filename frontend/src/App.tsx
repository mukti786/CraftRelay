import { FormEvent, useEffect, useState } from 'react'
import { api, json, User } from './api'
import Worker from './Worker'
import Assessor from './Assessor'
import Customer from './Customer'
import Admin from './Admin'
import { LocaleProvider, Localized, useLocale } from './i18n'

type View = 'home' | 'profile' | 'assessment' | 'market' | 'requests' | 'users' | 'catalogue' | 'audit'
export default function App() {
  return <LocaleProvider><AppWorkspace/></LocaleProvider>
}

function AppWorkspace() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [view, setView] = useState<View>('home')
  const [mode, setMode] = useState<'login'|'register'>('login')
  const { locale, setLocale, missingDraftCount } = useLocale()
  useEffect(() => { api<User>('/auth/me').then(setUser).catch(() => {}).finally(() => setLoading(false)) }, [])
  async function signOut() { await api('/auth/logout', { method: 'POST' }); setUser(null); setView('home') }
  if (loading) return <Localized><div className="loading"><img className="brand-symbol" src="/craftrelay-mark.svg" alt="CraftRelay"/><p>Preparing your workspace…</p></div></Localized>
  if (!user) return <Localized><AuthScreen mode={mode} setMode={setMode} onAuth={setUser} error={error} setError={setError} /></Localized>
  const tabs: { key: View; label: string; icon: string }[] = user.role === 'worker'
    ? [{key:'home',label:'Overview',icon:'⌂'},{key:'profile',label:'My profile',icon:'◉'},{key:'assessment',label:'Skill assessment',icon:'◇'},{key:'requests',label:'Work requests',icon:'↗'}]
    : user.role === 'assessor'
      ? [{key:'home',label:'Overview',icon:'⌂'},{key:'assessment',label:'Assessment queue',icon:'◇'}]
      : user.role === 'customer'
        ? [{key:'home',label:'Overview',icon:'⌂'},{key:'market',label:'Find a worker',icon:'⌕'},{key:'requests',label:'My requests',icon:'↗'}]
        : [{key:'home',label:'Overview',icon:'⌂'},{key:'users',label:'People',icon:'◉'},{key:'catalogue',label:'Qualifications',icon:'▤'},{key:'audit',label:'Audit trail',icon:'≋'}]
  return <Localized><div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#home" onClick={(e)=>{e.preventDefault();setView('home')}}><img className="brand-logo" src="/craftrelay-logo-dark.svg" alt="CraftRelay"/></a>
      <div className="side-label">WORKSPACE</div>
      <nav>{tabs.map(tab=><button key={tab.key} className={`nav-item ${view===tab.key?'active':''}`} onClick={()=>setView(tab.key)}><span className="nav-icon">{tab.icon}</span>{tab.label}</button>)}</nav>
      <div className="sidebar-bottom"><div className="secure-note"><span>✳</span><p><b>Human verified</b><br/>Assessment decisions stay with qualified assessors.</p></div><div className="profile-chip"><span className="avatar">{user.full_name.trim().charAt(0).toUpperCase()}</span><span className="user-meta"><b>{user.full_name}</b><small>{user.role}</small></span><button aria-label="Sign out" title="Sign out" className="icon-button" onClick={signOut}>↪</button></div></div>
    </aside>
    <main className="main-area"><header className="topbar"><div className="breadcrumb"><img src="/craftrelay-mark.svg" alt=""/> CraftRelay <span>/</span> <b>{tabs.find(x=>x.key===view)?.label ?? 'Overview'}</b></div><div className="top-actions"><label className="sr-only" htmlFor="language-select">Display language</label><select id="language-select" className="locale-select" aria-label="Display language" value={locale} onChange={event=>setLocale(event.target.value as 'en'|'hi'|'hne')}><option value="en">English</option><option value="hi">Hindi</option><option value="hne">Chhattisgarhi draft</option></select><span className={`draft-locale-note ${locale==='hne'?'visible':''}`} role="status">Draft: {missingDraftCount} labels remain in English for review</span><span className="connection"><i/> Connected</span><span className="avatar tiny">{user.full_name.trim().charAt(0).toUpperCase()}</span></div></header>
      <div className="content">{view==='home' && <Home user={user} setView={setView}/ >}
      {user.role==='worker' && view==='profile' && <Worker section="profile"/>}{user.role==='worker' && view==='assessment' && <Worker section="assessment"/>}{user.role==='worker' && view==='requests' && <Worker section="requests"/>}
      {user.role==='assessor' && view==='assessment' && <Assessor/>}
      {user.role==='customer' && view==='market' && <Customer section="market"/>}{user.role==='customer' && view==='requests' && <Customer section="requests"/>}
      {user.role==='admin' && view==='users' && <Admin section="users"/>}{user.role==='admin' && view==='catalogue' && <Admin section="catalogue"/>}{user.role==='admin' && view==='audit' && <Admin section="audit"/>}</div>
    </main>
  </div></Localized>
}
function AuthScreen({mode,setMode,onAuth,error,setError}:{mode:'login'|'register';setMode:(x:'login'|'register')=>void;onAuth:(u:User)=>void;error:string;setError:(s:string)=>void}) {
  const [busy,setBusy]=useState(false)
  const { locale, setLocale, missingDraftCount } = useLocale()
  async function submit(e:FormEvent<HTMLFormElement>) { e.preventDefault(); setError('');setBusy(true);const form=new FormData(e.currentTarget);const payload=Object.fromEntries(form.entries()); try { const u=await api<User>(`/auth/${mode==='login'?'login':'register'}`,{method:'POST',body:json(payload)});onAuth(u) } catch(err) {setError(err instanceof Error?err.message:'Could not sign in')} finally {setBusy(false)} }
  return <div className="auth-screen"><div className="auth-art"><div className="auth-art-top"><img className="auth-brand-logo" src="/craftrelay-logo.svg" alt="CraftRelay"/></div><div className="art-copy"><p className="eyebrow light">SKILLS THAT MOVE YOU FORWARD</p><h1>Your experience<br/><em>has value.</em></h1><p>Make your skills visible, get them assessed, and connect with people who need your work.</p></div><div className="art-bottom"><div className="art-stat"><b>01</b><span>Share what you know</span></div><div className="art-stat"><b>02</b><span>Get assessed by a person</span></div><div className="art-stat"><b>03</b><span>Find trusted work</span></div></div><div className="decor-orbit orbit-a"/><div className="decor-orbit orbit-b"/><div className="decor-dot"/></div><div className="auth-main"><div className="auth-card"><div className="auth-locale"><label className="sr-only" htmlFor="auth-language">Display language</label><select id="auth-language" className="locale-select" aria-label="Display language" value={locale} onChange={event=>setLocale(event.target.value as 'en'|'hi'|'hne')}><option value="en">English</option><option value="hi">Hindi</option><option value="hne">Chhattisgarhi draft</option></select></div>{locale==='hne'&&<p className="draft-auth-note" role="status">Draft: {missingDraftCount} labels remain in English for review</p>}<div className="mobile-brand"><img className="brand-symbol" src="/craftrelay-mark.svg" alt=""/><b>CraftRelay</b></div><p className="eyebrow">{mode==='login'?'WELCOME BACK':'WELCOME'}</p><h2>{mode==='login'?'Sign in to CraftRelay':'Create your account'}</h2><p className="subtle">{mode==='login'?'Pick up where your skills story left off.':'Start with a free account. You can update your details later.'}</p><form onSubmit={submit} className="form-stack">{mode==='register'&&<label>Full name<input name="full_name" required minLength={2} placeholder="e.g. Asha Patel" autoComplete="name"/></label>}<label>Email address<input name="email" required type="email" placeholder="you@example.com" autoComplete="email"/></label><label>Password<input name="password" required type="password" minLength={mode==='register'?10:1} placeholder={mode==='register'?'At least 10 characters':'Your password'} autoComplete={mode==='register'?'new-password':'current-password'}/></label>{mode==='register'&&<label>I am joining as<select name="role"><option value="worker">A skilled worker</option><option value="customer">A customer</option></select></label>}{error&&<div className="alert" role="alert">{error}</div>}<button className="button primary full" disabled={busy}>{busy?'Please wait…':mode==='login'?'Sign in':'Create account'}<span>→</span></button></form><p className="auth-switch">{mode==='login'?"New to CraftRelay?":"Already have an account?"} <button type="button" onClick={()=>{setError('');setMode(mode==='login'?'register':'login')}}>{mode==='login'?'Create an account':'Sign in'}</button></p><p className="auth-foot">By continuing, you agree to our <a href="#terms">Terms</a> and <a href="#privacy">Privacy Policy</a>.</p></div></div></div>
}
function Home({user,setView}:{user:User;setView:(v:View)=>void}) {
  const greetings:Record<User['role'],string>={worker:'Your work speaks for itself.',assessor:'Every decision builds trust.',customer:'Find the right person for the job.',admin:'A clear view of the platform.'}
  const actions:Record<User['role'],{title:string;copy:string;button:string;view:View}[]>={
    worker:[{title:'Build your profile',copy:'Tell people what you do and how long you have done it.',button:'Complete profile',view:'profile'},{title:'Get your skills recognized',copy:'Choose a qualification and share evidence for review.',button:'Start assessment',view:'assessment'}],
    assessor:[{title:'Review assessment cases',copy:'Check evidence and record a decision for each criterion.',button:'Open queue',view:'assessment'}],
    customer:[{title:'Find a skilled worker',copy:'Search by trade, skill, or service area.',button:'Browse workers',view:'market'},{title:'Track service requests',copy:'Keep requests and service reviews in one place.',button:'View requests',view:'requests'}],
    admin:[{title:'Manage the catalogue',copy:'Maintain qualification versions and their criteria.',button:'Open catalogue',view:'catalogue'},{title:'Review activity',copy:'See recent changes and platform activity.',button:'View audit trail',view:'audit'}]}
  const roleTitle={worker:'WORKER WORKSPACE',assessor:'ASSESSOR WORKSPACE',customer:'CUSTOMER WORKSPACE',admin:'ADMINISTRATION'}
  return <><div className="welcome-row"><div><p className="eyebrow">{roleTitle[user.role]}</p><h1>{greetings[user.role]}</h1><p className="subtle">Welcome back, {user.full_name.split(' ')[0]}. Here’s what you can do today.</p></div><span className="date-stamp">CRAFTRELAY · SKILL TO SERVICE</span></div><div className="home-layout"><section className="action-list">{actions[user.role].map((a,i)=><article className="action-card" key={a.title}><div className="action-number">0{i+1}</div><div className="action-copy"><h3>{a.title}</h3><p>{a.copy}</p><button className="text-button" onClick={()=>setView(a.view)}>{a.button}<span>↗</span></button></div><div className="action-symbol">{i===0?'↗':'◇'}</div></article>)}</section><aside className="home-aside"><div className="quote-mark">“</div><p className="quote">Real skills are built through real work. We help make them easier to see.</p><div className="quote-rule"/><small>CRAFTRELAY PROMISE</small><div className="promise-list"><span><i>✓</i> Your evidence stays private</span><span><i>✓</i> People make assessment decisions</span><span><i>✓</i> Reviews are about service</span></div></aside></div><footer className="page-foot">CraftRelay · Proven Skills. Trusted Services.</footer></>
}
