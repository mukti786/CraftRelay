import { FormEvent, useEffect, useState } from 'react'
import { api, ApiError, json, User, DEMO_MODE, demoLogin, resetDemoData } from './api'
import Worker from './Worker'
import Assessor from './Assessor'
import Customer from './Customer'
import Admin from './Admin'
import { LocaleProvider, Localized, translated, useLocale } from './i18n'
import { Feedback } from './ui'

type View = 'home' | 'profile' | 'assessment' | 'market' | 'requests' | 'users' | 'catalogue' | 'audit'
export default function App() {
  return <LocaleProvider><AppWorkspace/></LocaleProvider>
}

function AppWorkspace() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [sessionError, setSessionError] = useState(false)
  const [error, setError] = useState('')
  const [view, setView] = useState<View>('home')
  const [mode, setMode] = useState<'login'|'register'>('login')
  const { locale, setLocale, missingDraftCount } = useLocale()
  async function loadSession() {
    setLoading(true)
    setSessionError(false)
    try {
      setUser(await api<User>('/auth/me'))
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) setUser(null)
      else setSessionError(true)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { void loadSession() }, [])
  async function signOut() {
    setError('')
    try {
      await api('/auth/logout', { method: 'POST' })
      setUser(null)
      setView('home')
    } catch {
      setError('Could not sign out. Check your connection and try again.')
    }
  }
  if (loading) return <Localized><div className="loading"><img className="brand-symbol" src="/craftrelay-mark.svg" alt="CraftRelay"/><p>Preparing your workspace…</p></div></Localized>
  if (sessionError) return <Localized><main className="session-recovery"><section className="session-recovery-card" aria-labelledby="session-error-title"><h1 id="session-error-title">Could not connect to CraftRelay</h1><Feedback>Check your connection and try again.</Feedback><button type="button" className="button primary" onClick={() => void loadSession()}>Retry</button></section></main></Localized>
  if (!user) return <Localized><AuthScreen mode={mode} setMode={setMode} onAuth={setUser} onOpenWorkspace={(nextUser, nextView) => { setUser(nextUser); setView(nextView) }} error={error} setError={setError} /></Localized>
  const tabs: { key: View; label: string; icon: string }[] = user.role === 'worker'
    ? [{key:'home',label:'Overview',icon:'⌂'},{key:'profile',label:'My profile',icon:'◉'},{key:'assessment',label:'Skill assessment',icon:'◇'},{key:'requests',label:'Work requests',icon:'↗'}]
    : user.role === 'assessor'
      ? [{key:'home',label:'Overview',icon:'⌂'},{key:'assessment',label:'Assessment queue',icon:'◇'}]
      : user.role === 'customer'
        ? [{key:'home',label:'Overview',icon:'⌂'},{key:'market',label:'Find a worker',icon:'⌕'},{key:'requests',label:'My requests',icon:'↗'}]
        : [{key:'home',label:'Overview',icon:'⌂'},{key:'users',label:'People',icon:'◉'},{key:'catalogue',label:'Qualifications',icon:'▤'},{key:'audit',label:'Audit trail',icon:'≋'}]
  return <Localized><div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#home" onClick={(e)=>{e.preventDefault();setView('home')}}><img className="brand-logo" src="/craftrelay-logo.svg" alt="CraftRelay"/></a>
      <div className="side-label">WORKSPACE</div>
      <nav aria-label="Primary navigation">{tabs.map(tab=><button type="button" key={tab.key} aria-current={view===tab.key?'page':undefined} className={`nav-item ${view===tab.key?'active':''}`} onClick={()=>setView(tab.key)}><span className="nav-icon" aria-hidden="true">{tab.icon}</span>{tab.label}</button>)}</nav>
      <div className="sidebar-bottom"><div className="secure-note"><span aria-hidden="true">✳</span><p><b>Human verified</b><br/>Assessment decisions stay with qualified assessors.</p></div><div className="profile-chip"><span className="avatar" aria-hidden="true">{user.full_name.trim().charAt(0).toUpperCase()}</span><span className="user-meta"><b>{user.full_name}</b><small>{user.role}</small></span><button type="button" aria-label="Sign out" title="Sign out" className="icon-button" onClick={signOut}>↪</button></div></div>
    </aside>
    <main className="main-area"><header className="topbar"><div className="breadcrumb"><img src="/craftrelay-mark.svg" alt=""/> CraftRelay <span>/</span> <b>{tabs.find(x=>x.key===view)?.label ?? 'Overview'}</b></div><div className="top-actions"><label className="sr-only" htmlFor="language-select">Display language</label><select id="language-select" className="locale-select" aria-label="Display language" value={locale} onChange={event=>setLocale(event.target.value as 'en'|'hi'|'hne')}><option value="en">English</option><option value="hi">Hindi</option><option value="hne">Chhattisgarhi draft</option></select><span className={`draft-locale-note ${locale==='hne'?'visible':''}`} role="status">Draft: {missingDraftCount} labels remain in English for review</span><span className="avatar tiny" aria-hidden="true">{user.full_name.trim().charAt(0).toUpperCase()}</span></div></header>
      <div className="content">{error && <Feedback>{error}</Feedback>}{view==='home' && <Home user={user} setView={setView}/ >}
      {user.role==='worker' && view==='profile' && <Worker section="profile"/>}{user.role==='worker' && view==='assessment' && <Worker section="assessment"/>}{user.role==='worker' && view==='requests' && <Worker section="requests"/>}
      {user.role==='assessor' && view==='assessment' && <Assessor/>}
      {user.role==='customer' && view==='market' && <Customer section="market"/>}{user.role==='customer' && view==='requests' && <Customer section="requests"/>}
      {user.role==='admin' && view==='users' && <Admin section="users"/>}{user.role==='admin' && view==='catalogue' && <Admin section="catalogue"/>}{user.role==='admin' && view==='audit' && <Admin section="audit"/>}</div>
    </main>
  </div></Localized>
}
function AuthScreen({mode,setMode,onAuth,onOpenWorkspace,error,setError}:{mode:'login'|'register';setMode:(x:'login'|'register')=>void;onAuth:(u:User)=>void;onOpenWorkspace:(u:User,view:View)=>void;error:string;setError:(s:string)=>void}) {
  const [busy,setBusy]=useState(false)
  const { locale, setLocale, missingDraftCount } = useLocale()
  async function submit(e:FormEvent<HTMLFormElement>) { e.preventDefault(); setError('');setBusy(true);const form=new FormData(e.currentTarget);const payload=Object.fromEntries(form.entries()); try { const u=await api<User>(`/auth/${mode==='login'?'login':'register'}`,{method:'POST',body:json(payload)});onAuth(u) } catch(err) {setError(err instanceof Error?err.message:'Could not sign in')} finally {setBusy(false)} }
  if (DEMO_MODE) return <DemoLanding locale={locale} setLocale={setLocale} missingDraftCount={missingDraftCount} onAuth={onOpenWorkspace} error={error} />
  return <Localized><div className="auth-screen"><div className="auth-art"><div className="auth-art-top"><img className="auth-brand-logo" src="/craftrelay-logo-dark.svg" alt="CraftRelay"/></div><div className="art-copy"><p className="eyebrow light">SKILLS THAT MOVE YOU FORWARD</p><h1>Your experience<br/><em>has value.</em></h1><p>Make your skills visible, get them assessed, and connect with people who need your work.</p></div><div className="art-bottom"><div className="art-stat"><b>01</b><span>Share what you know</span></div><div className="art-stat"><b>02</b><span>Get assessed by a person</span></div><div className="art-stat"><b>03</b><span>Find trusted work</span></div></div><div className="decor-orbit orbit-a"/><div className="decor-orbit orbit-b"/><div className="decor-dot"/></div><div className="auth-main"><div className="auth-card"><div className="auth-locale"><label className="sr-only" htmlFor="auth-language">Display language</label><select id="auth-language" className="locale-select" aria-label="Display language" value={locale} onChange={event=>setLocale(event.target.value as 'en'|'hi'|'hne')}><option value="en">English</option><option value="hi">Hindi</option><option value="hne">Chhattisgarhi draft</option></select></div>{locale==='hne'&&<p className="draft-auth-note" role="status">Draft: {missingDraftCount} labels remain in English for review</p>}<div className="mobile-brand"><img className="brand-symbol" src="/craftrelay-mark.svg" alt=""/><b>CraftRelay</b></div><p className="eyebrow">{mode==='login'?'WELCOME BACK':'WELCOME'}</p><h2>{mode==='login'?'Sign in to CraftRelay':'Create your account'}</h2><p className="subtle">{mode==='login'?'Pick up where your skills story left off.':'Start with a free account. You can update your details later.'}</p><form onSubmit={submit} className="form-stack">{mode==='register'&&<label>Full name<input name="full_name" required minLength={2} placeholder="e.g. Asha Patel" autoComplete="name"/></label>}<label>Email address<input name="email" required type="email" placeholder="you@example.com" autoComplete="email"/></label><label>Password<input name="password" required type="password" minLength={mode==='register'?10:1} placeholder={mode==='register'?'At least 10 characters':'Your password'} autoComplete={mode==='register'?'new-password':'current-password'}/></label>{mode==='register'&&<label>I am joining as<select name="role"><option value="worker">A skilled worker</option><option value="customer">A customer</option></select></label>}{error&&<div className="alert" role="alert">{error}</div>}<button className="button primary full" disabled={busy}>{busy?'Please wait…':mode==='login'?'Sign in':'Create account'}<span>→</span></button></form><p className="auth-switch">{mode==='login'?"New to CraftRelay?":"Already have an account?"} <button type="button" onClick={()=>{setError('');setMode(mode==='login'?'register':'login')}}>{mode==='login'?'Create an account':'Sign in'}</button></p></div></div></div></Localized>
}

function DemoLanding({locale,setLocale,missingDraftCount,onAuth,error}:{locale:'en'|'hi'|'hne';setLocale:(locale:'en'|'hi'|'hne')=>void;missingDraftCount:number;onAuth:(u:User,view:View)=>void;error:string}) {
  return <Localized><div className="demo-landing">
    <header className="landing-nav">
      <a className="landing-brand" href="#top" aria-label="CraftRelay home"><img src="/craftrelay-mark.svg" alt=""/><span>CraftRelay</span></a>
      <nav aria-label="Landing page navigation"><a href="#how-it-works">How it works</a><a href="#benefits">Benefits</a></nav>
      <div className="landing-nav-actions">
        <label className="sr-only" htmlFor="auth-language">Display language</label>
        <select id="auth-language" className="locale-select" value={locale} onChange={event=>setLocale(event.target.value as 'en'|'hi'|'hne')}><option value="en">English</option><option value="hi">Hindi</option><option value="hne">Chhattisgarhi draft</option></select>
        <button className="button outline landing-assessor-link" type="button" onClick={async()=>onAuth(await demoLogin('assessor'),'assessment')}>Assessor access</button>
      </div>
    </header>
    {locale==='hne'&&<p className="draft-auth-note landing-draft-note" role="status">Draft: {missingDraftCount} labels remain in English for review</p>}
    <main id="top">
      <section className="landing-hero" aria-labelledby="landing-title">
        <div className="landing-hero-content">
          <p className="eyebrow light">RECOGNITION OF PRIOR LEARNING</p>
          <h1 id="landing-title">Trusted skills.<br/><em>Better work connections.</em></h1>
          <p className="landing-description">Workers document their experience and share evidence for review. Authorized assessors record competency decisions and feedback. Customers can discover worker profiles and manage service requests.</p>
          <div className="landing-hero-actions">
            <button className="button primary" type="button" onClick={async()=>onAuth(await demoLogin('customer'),'market')}>Find a worker <span aria-hidden="true">→</span></button>
            <button className="button landing-secondary" type="button" onClick={async()=>onAuth(await demoLogin('worker'),'profile')}>Build a worker profile <span aria-hidden="true">↗</span></button>
          </div>
          <p className="landing-trust-note">Formal competency decisions stay with authorized human assessors.</p>
        </div>
        <div className="landing-hero-aside" aria-label="CraftRelay workflow at a glance">
          <span className="landing-aside-rule" aria-hidden="true"/>
          <p className="landing-aside-label">FROM EXPERIENCE TO OPPORTUNITY</p>
          <ol><li><b>01</b><span>Worker shares qualifications and evidence</span></li><li><b>02</b><span>Assessor reviews against criteria</span></li><li><b>03</b><span>Customers discover services and request work</span></li></ol>
        </div>
      </section>
      <section className="landing-process" id="how-it-works" aria-labelledby="process-title">
        <div className="landing-section-heading"><p className="eyebrow">A CLEAR PATH</p><h2 id="process-title">How CraftRelay works</h2></div>
        <div className="landing-step-grid">
          <article><span className="landing-step-number">01</span><h3>Share your experience</h3><p>Workers describe their skills and submit evidence details against qualification criteria.</p></article>
          <article><span className="landing-step-number">02</span><h3>Receive human assessment</h3><p>Authorized assessors review the evidence, record decisions, and request more information when needed.</p></article>
          <article><span className="landing-step-number">03</span><h3>Connect for work</h3><p>Customers explore worker profiles and manage service requests through the available workspace.</p></article>
        </div>
      </section>
      <section className="landing-benefits" id="benefits" aria-labelledby="benefits-title">
        <div className="landing-section-heading"><p className="eyebrow">BUILT AROUND CLARITY</p><h2 id="benefits-title">A more transparent way to move forward</h2></div>
        <div className="landing-benefit-grid">
          <article><span aria-hidden="true">01</span><div><h3>Criteria-based review</h3><p>Qualification criteria give workers and assessors a shared reference for evidence review.</p></div></article>
          <article><span aria-hidden="true">02</span><div><h3>Clear feedback</h3><p>Assessment notes and remediation requests show what has been reviewed and what needs attention.</p></div></article>
          <article><span aria-hidden="true">03</span><div><h3>Service discovery</h3><p>Customers can search worker profiles by trade or service area and send a work request.</p></div></article>
        </div>
      </section>
      <section className="landing-final-cta" aria-labelledby="final-cta-title">
        <div><p className="eyebrow light">TAKE THE NEXT STEP</p><h2 id="final-cta-title">Find skills for the work ahead.</h2></div>
        <button className="button primary" type="button" onClick={async()=>onAuth(await demoLogin('customer'),'market')}>Explore worker profiles <span aria-hidden="true">→</span></button>
      </section>
    </main>
    <footer className="landing-footer">
      <div className="landing-footer-note" role="note"><b>Sample workspace access</b><span>Sign-in is simulated and does not verify identity. Changes are saved in this browser; evidence files are not stored.</span></div>
      <button type="button" className="text-button landing-reset" onClick={async () => { if (window.confirm(translated('Reset CraftRelay data saved in this browser?', locale))) await resetDemoData() }}>Reset browser data</button>
      {error&&<div className="alert" role="alert">{error}</div>}
    </footer>
  </div></Localized>
}

function Home({user,setView}:{user:User;setView:(v:View)=>void}) {
  const greetings:Record<User['role'],string>={worker:'Your work speaks for itself.',assessor:'Every decision builds trust.',customer:'Find the right person for the job.',admin:'A clear view of the platform.'}
  const actions:Record<User['role'],{title:string;copy:string;button:string;view:View}[]>={
    worker:[{title:'Build your profile',copy:'Tell people what you do and how long you have done it.',button:'Complete profile',view:'profile'},{title:'Get your skills recognized',copy:'Choose a qualification and share evidence for review.',button:'Start assessment',view:'assessment'}],
    assessor:[{title:'Review assessment cases',copy:'Check evidence and record a decision for each criterion.',button:'Open queue',view:'assessment'}],
    customer:[{title:'Find a skilled worker',copy:'Search by trade, skill, or service area.',button:'Browse workers',view:'market'},{title:'Track service requests',copy:'Keep requests and service reviews in one place.',button:'View requests',view:'requests'}],
    admin:[{title:'Manage the catalogue',copy:'Maintain qualification versions and their criteria.',button:'Open catalogue',view:'catalogue'},{title:'Review activity',copy:'See recent changes and platform activity.',button:'View audit trail',view:'audit'}]}
  const roleTitle={worker:'WORKER WORKSPACE',assessor:'ASSESSOR WORKSPACE',customer:'CUSTOMER WORKSPACE',admin:'ADMINISTRATION'}
  return <Localized><><div className="welcome-row"><div><p className="eyebrow">{roleTitle[user.role]}</p><h1>{greetings[user.role]}</h1><p className="subtle">Welcome back, {user.full_name.split(' ')[0]}. Here’s what you can do today.</p></div><span className="date-stamp">CRAFTRELAY · SKILL TO SERVICE</span></div><div className="home-layout"><section className="action-list">{actions[user.role].map((a,i)=><article className="action-card" key={a.title}><div className="action-number">0{i+1}</div><div className="action-copy"><h3>{a.title}</h3><p>{a.copy}</p><button className="text-button" onClick={()=>setView(a.view)}>{a.button}<span>↗</span></button></div><div className="action-symbol">{i===0?'↗':'◇'}</div></article>)}</section><aside className="home-aside"><div className="quote-mark">“</div><p className="quote">Real skills are built through real work. We help make them easier to see.</p><div className="quote-rule"/><small>CRAFTRELAY PROMISE</small><div className="promise-list"><span><i>✓</i> Your evidence stays private</span><span><i>✓</i> People make assessment decisions</span><span><i>✓</i> Reviews are about service</span></div></aside></div><footer className="page-foot">CraftRelay · Proven Skills. Trusted Services.</footer></></Localized>
}
