import React, { useEffect, useMemo, useState } from 'react'
import { initializeApp } from 'firebase/app'
import {
  getFirestore, collection, addDoc, serverTimestamp,
  onSnapshot, query, orderBy
} from 'firebase/firestore'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { motion } from 'framer-motion'
import confetti from 'canvas-confetti'

const PINCODE = '8448'
const CONSULTANTS = ['Marcus','Lisanna','Nick','Gea','Dion','Sander','Yde']

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}
let db = null
try { db = getFirestore(initializeApp(firebaseConfig)) } catch(e){ console.warn('Firebase init failed (missing env?)', e) }

function isoWeek(d){
  const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const day = tmp.getUTCDay() || 7
  tmp.setUTCDate(tmp.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1))
  return Math.ceil(((tmp - yearStart)/86400000 + 1)/7)
}
function todayStr(){ return new Date().toISOString().slice(0,10) }

export default function App(){
  const [authorized, setAuthorized] = useState(false)
  const [pin, setPin] = useState('')
  const [activePerson, setActivePerson] = useState(CONSULTANTS[0])
  const [filterRange, setFilterRange] = useState('week')
  const [date, setDate] = useState(todayStr())
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ intakes: 0, interviews: 0, placements: 0, prospects: 0 })

  useEffect(() => {
    if(!db){ setLoading(false); return }
    const q = query(collection(db,'entries'), orderBy('createdAt','desc'))
    const unsub = onSnapshot(q, snap => {
      setEntries(snap.docs.map(d=>({id:d.id, ...d.data()})))
      setLoading(false)
    })
    return () => unsub()
  }, [])

  const period = useMemo(() => {
    const d = new Date(date)
    return { week: isoWeek(d), month: d.getMonth()+1, year: d.getFullYear() }
  }, [date])

  const filtered = useMemo(() => {
    return entries.filter(e => {
      if(filterRange==='week') return e.week===period.week && e.year===period.year
      if(filterRange==='month') return e.month===period.month && e.year===period.year
      if(filterRange==='year') return e.year===period.year
      return true
    })
  }, [entries, filterRange, period])

  const aggregated = useMemo(() => {
    const base = Object.fromEntries(CONSULTANTS.map(n=>[n,{ name:n, intakes:0, interviews:0, placements:0, prospects:0 }]))
    for(const e of filtered){
      if(!base[e.name]) continue
      base[e.name].intakes += e.intakes||0
      base[e.name].interviews += e.interviews||0
      base[e.name].placements += e.placements||0
      base[e.name].prospects += e.prospects||0
    }
    return Object.values(base)
  }, [filtered])

  const total = useMemo(() => aggregated.reduce((acc,cur)=> ({
    intakes: acc.intakes + cur.intakes,
    interviews: acc.interviews + cur.interviews,
    placements: acc.placements + cur.placements,
    prospects: acc.prospects + cur.prospects,
  }), {intakes:0,interviews:0,placements:0,prospects:0}), [aggregated])

  const ranking = useMemo(() => [...aggregated].sort((a,b)=>(b.placements-a.placements)|| (b.intakes-a.intakes) || (b.interviews-a-interviews)), [aggregated])

  const submit = async (e) => {
    e.preventDefault()
    if(!authorized){ alert('Enter access code first'); return }
    if(!db){ alert('Firestore not configured (set VITE_FIREBASE_* env vars) in your host'); return }
    const d = new Date(date)
    const payload = {
      name: activePerson,
      date: d.toISOString(),
      week: isoWeek(d),
      month: d.getMonth()+1,
      year: d.getFullYear(),
      intakes: Number(form.intakes)||0,
      interviews: Number(form.interviews)||0,
      placements: Number(form.placements)||0,
      prospects: Number(form.prospects)||0,
      createdAt: serverTimestamp(),
    }
    await addDoc(collection(db,'entries'), payload)
    if(payload.placements>0){
      confetti({ particleCount: 120, spread: 70, origin: { y: 0.8 } })
    }
    setForm({ intakes:0, interviews:0, placements:0, prospects:0 })
  }

  return (
    <div className="container">
      <div className="header">
        <div>
          <h1 className="title">Xelvin Performance Dashboard</h1>
          <p className="muted">Live results — week / month / year</p>
        </div>
        <div className="card" style={{background:'var(--panel)'}}>
          <label>Filter</label>
          <div style={{display:'flex', gap:8}}>
            <select value={filterRange} onChange={(e)=>setFilterRange(e.target.value)}>
              <option value="week">Week</option>
              <option value="month">Month</option>
              <option value="year">Year</option>
            </select>
            <input type="date" value={date} onChange={(e)=>setDate(e.target.value)} />
          </div>
        </div>
      </div>

      <div style={{display:'flex', flexWrap:'wrap', gap:8, marginBottom:12}}>
        {CONSULTANTS.map(n => (
          <button key={n} onClick={()=>setActivePerson(n)} className={'btn'+(activePerson===n?' active':'')}>{n}</button>
        ))}
      </div>

      <div className="grid grid-12">
        <section className="col-5 card">
          {!authorized ? (
            <div>
              <h2 style={{margin:'0 0 8px 0'}}>Enter access code</h2>
              <div style={{display:'flex', gap:8}}>
                <input placeholder="Access code" type="password" value={pin} onChange={(e)=>setPin(e.target.value)} />
                <button className="btn active" onClick={()=> setAuthorized(pin===PINCODE)}>Unlock</button>
              </div>
              <p className="muted" style={{marginTop:6}}>Required to submit entries.</p>
            </div>
          ) : (
            <form onSubmit={submit}>
              <div className="muted" style={{marginBottom:8}}>Active consultant: <b>{activePerson}</b></div>
              <div className="row">
                <Field label="Candidate intakes" value={form.intakes} onChange={v=>setForm(s=>({...s,intakes:v}))} />
                <Field label="Client interviews" value={form.interviews} onChange={v=>setForm(s=>({...s,interviews:v}))} />
                <Field label="Placements" value={form.placements} onChange={v=>setForm(s=>({...s,placements:v}))} />
                <Field label="New business meetings" value={form.prospects} onChange={v=>setForm(s=>({...s,prospects:v}))} />
              </div>
              <div style={{display:'flex', gap:8, marginTop:10}}>
                <button className="btn active" type="submit">Save</button>
                <button className="btn" type="button" onClick={()=>setForm({intakes:0,interviews:0,placements:0,prospects:0})}>Reset</button>
              </div>
            </form>
          )}

          <div className="grid" style={{gridTemplateColumns:'1fr 1fr', marginTop:16}}>
            <KPI title="Placements" value={total.placements} color="var(--xelvin-orange)" />
            <KPI title="Candidate intakes" value={total.intakes} color="var(--xelvin-blue)" />
            <KPI title="Client interviews" value={total.interviews} color="#3B82F6" />
            <KPI title="New business meetings" value={total.prospects} color="#10B981" />
          </div>
        </section>

        <section className="col-4 card">
          <h2 style={{margin:'0 0 8px 0'}}>Charts</h2>
          <div style={{height:180, marginBottom:18}}>
            <h3 style={{margin:'0 0 6px 0', fontSize:14}}>Placements</h3>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={aggregated.map(a=>({name:a.name, value:a.placements}))}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" name="Placements" fill="var(--xelvin-orange)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div style={{height:180}}>
            <h3 style={{margin:'0 0 6px 0', fontSize:14}}>Candidate intakes</h3>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={aggregated.map(a=>({name:a.name, value:a.intakes}))}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" name="Intakes" fill="var(--xelvin-blue)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="col-3 ranking">
          <h2 style={{margin:'0 0 8px 0'}}>Ranking (placements)</h2>
          <div>
            {ranking.map((r, idx) => (
              <motion.div key={r.name} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx*0.04 }} className="rankrow">
                <div style={{display:'flex', alignItems:'center', gap:8}}>
                  <span style={{fontSize:18}}>{idx===0?'🥇':idx===1?'🥈':idx===2?'🥉':'🏁'}</span>
                  <div>
                    <div style={{fontWeight:600}}>{r.name}</div>
                    <div className="muted">P: {r.placements} • I: {r.intakes} • CI: {r.interviews}</div>
                  </div>
                </div>
                <div style={{fontSize:18, fontWeight:800}}>{r.placements}</div>
              </motion.div>
            ))}
          </div>
        </section>
      </div>

      <p className="muted" style={{marginTop:12}}>Status: {loading ? 'Loading…' : 'Live'}. Tip: Full screen on TV (F11).</p>
    </div>
  )
}

function Field({ label, value, onChange }){
  return (
    <div>
      <label>{label}</label>
      <input type="number" min="0" value={value} onChange={e=>onChange(e.target.value)} />
    </div>
  )
}
function KPI({ title, value, color }){
  return (
    <div className="card">
      <div className="muted">{title}</div>
      <div className="kpi" style={{color}}>{value}</div>
    </div>
  )
}
