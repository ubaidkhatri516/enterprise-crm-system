import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { z, ZodError } from 'zod';
import {User,Lead,Deal,Activity,Customer} from './models.js';
if(!process.env.MONGODB_URI||!process.env.JWT_SECRET||process.env.JWT_SECRET.length<32){console.error('Configure MONGODB_URI and JWT_SECRET (32+ chars)');process.exit(1)}
const app=express();app.use(helmet());app.use(cors({origin:process.env.CLIENT_ORIGIN||'http://localhost:5173'}));app.use(express.json({limit:'64kb'}));app.use(morgan('dev'));
app.use('/api/auth/login',rateLimit({windowMs:900000,limit:20,standardHeaders:'draft-7',legacyHeaders:false}));
const run=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
const auth=run(async(req,res,next)=>{let payload;try{payload=jwt.verify((req.headers.authorization||'').replace(/^Bearer /,''),process.env.JWT_SECRET)}catch{return res.status(401).json({error:'Invalid or expired token'})}req.user=await User.findById(payload.sub).select('-passwordHash');if(!req.user)return res.status(401).json({error:'User not found'});next()});
const roles=(...names)=>(req,res,next)=>names.includes(req.user.role)?next():res.status(403).json({error:'Insufficient permissions'});
const scope=req=>req.user.role==='sales'?{owner:req.user._id}:{};
const can=(req,doc)=>req.user.role!=='sales'||String(doc.owner)===String(req.user._id);
const id=z.string().regex(/^[a-f\d]{24}$/i);
const t=z.string().trim().max(500);
const schemas={
 leads:z.object({name:t.min(1),email:t.optional(),company:t.optional(),phone:t.optional(),source:z.enum(['Website','Referral','LinkedIn','Cold outreach','Other']).optional(),status:z.enum(['New','Contacted','Qualified','Lost']).optional(),value:z.coerce.number().min(0).optional(),notes:t.optional()}),
 customers:z.object({name:t.min(1),email:t.optional(),company:t.optional(),phone:t.optional(),industry:t.optional()}),
 deals:z.object({title:t.min(1),company:t.optional(),amount:z.coerce.number().min(0).optional(),stage:z.enum(['Prospecting','Qualification','Proposal','Negotiation','Won','Lost']).optional(),closeDate:z.union([z.coerce.date(),z.null()]).optional()}),
 activities:z.object({type:z.enum(['Call','Email','Meeting','Note']),subject:t.min(1),details:t.optional(),relatedType:z.enum(['Lead','Customer','Deal']),relatedId:id,occurredAt:z.coerce.date().optional()})};
const models={leads:Lead,customers:Customer,deals:Deal,activities:Activity};
app.get('/api/health',(_req,res)=>res.json({status:'ok'}));
app.post('/api/auth/login',run(async(req,res)=>{const d=z.object({email:z.string().email(),password:z.string().min(1)}).parse(req.body);const u=await User.findOne({email:d.email.toLowerCase()});if(!u||!await bcrypt.compare(d.password,u.passwordHash))return res.status(401).json({error:'Invalid credentials'});res.json({token:jwt.sign({sub:String(u._id)},process.env.JWT_SECRET,{expiresIn:'12h'}),user:{_id:u._id,name:u.name,email:u.email,role:u.role}})}));
app.get('/api/auth/me',auth,(req,res)=>res.json(req.user));
app.get('/api/auth/users',auth,roles('admin','manager'),run(async(req,res)=>res.json(await User.find().select('name email role').sort({name:1}))));
app.post('/api/auth/users',auth,roles('admin'),run(async(req,res)=>{const d=z.object({name:t.min(2),email:z.string().email(),password:z.string().min(8),role:z.enum(['admin','manager','sales'])}).parse(req.body);const u=await User.create({name:d.name,email:d.email.toLowerCase(),passwordHash:await bcrypt.hash(d.password,12),role:d.role});res.status(201).json({_id:u._id,name:u.name,email:u.email,role:u.role})}));
app.patch('/api/auth/users/:id/role',auth,roles('admin'),run(async(req,res)=>{id.parse(req.params.id);const d=z.object({role:z.enum(['admin','manager','sales'])}).parse(req.body);if(String(req.user._id)===req.params.id&&d.role!=='admin')return res.status(400).json({error:'Cannot remove your own admin role'});const u=await User.findByIdAndUpdate(req.params.id,d,{new:true,runValidators:true}).select('name email role');if(!u)return res.status(404).json({error:'User not found'});res.json(u)}));
for(const [key,Model] of Object.entries(models)){
 const schema=schemas[key];
 app.get('/api/'+key,auth,run(async(req,res)=>{const page=Math.max(1,Number(req.query.page)||1),limit=Math.min(100,Math.max(1,Number(req.query.limit)||50));const filter={...scope(req)};if(req.query.search){const query=String(req.query.search).slice(0,80).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');filter[key==='deals'?'title':key==='activities'?'subject':'name']={$regex:query,$options:'i'}}const [items,total]=await Promise.all([Model.find(filter).sort({createdAt:-1}).skip((page-1)*limit).limit(limit).populate('owner','name email'),Model.countDocuments(filter)]);res.json({items,total,page,limit})}));
 app.post('/api/'+key,auth,run(async(req,res)=>{const d=schema.parse(req.body);if(key==='activities'){const related={Lead,Customer,Deal}[d.relatedType];const record=await related.findById(d.relatedId);if(!record||!can(req,record))return res.status(404).json({error:'Related record not found'})}const item=await Model.create({...d,owner:req.user._id});res.status(201).json(item)}));
 app.patch('/api/'+key+'/:id',auth,run(async(req,res)=>{id.parse(req.params.id);const item=await Model.findById(req.params.id);if(!item||!can(req,item))return res.status(404).json({error:'Record not found'});const d=schema.partial().parse(req.body);if(key==='activities'&&(d.relatedId||d.relatedType)){const record=await ({Lead,Customer,Deal}[d.relatedType||item.relatedType]).findById(d.relatedId||item.relatedId);if(!record||!can(req,record))return res.status(404).json({error:'Related record not found'})}Object.assign(item,d);await item.save();res.json(item)}));
 app.delete('/api/'+key+'/:id',auth,roles('admin','manager'),run(async(req,res)=>{id.parse(req.params.id);const item=await Model.findByIdAndDelete(req.params.id);if(!item)return res.status(404).json({error:'Record not found'});res.json({ok:true})}));
}
app.get('/api/dashboard',auth,run(async(req,res)=>{const q=scope(req);const [leads,customers,deals,activities,stages,recent]=await Promise.all([Lead.countDocuments(q),Customer.countDocuments(q),Deal.countDocuments(q),Activity.countDocuments(q),Deal.aggregate([{$match:q},{$group:{_id:'$stage',count:{$sum:1},value:{$sum:'$amount'}}}]),Activity.find(q).sort({occurredAt:-1}).limit(6).populate('owner','name')]);res.json({leads,customers,deals,activities,wonRevenue:stages.find(s=>s._id==='Won')?.value||0,stageStats:stages,recent})}));
app.use((err,req,res,next)=>{if(err instanceof ZodError)return res.status(400).json({error:err.issues.map(x=>x.path.join('.')+': '+x.message).join('; ')});if(err.code===11000)return res.status(409).json({error:'Duplicate value'});if(err.name==='CastError')return res.status(400).json({error:'Invalid ID'});console.error(err);res.status(500).json({error:'Internal server error'})});
try{await mongoose.connect(process.env.MONGODB_URI);app.listen(Number(process.env.PORT)||4000,()=>console.log('CRM API ready'))}catch(e){console.error(e.message);process.exit(1)}
