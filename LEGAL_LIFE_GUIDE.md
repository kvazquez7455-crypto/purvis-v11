# PURVIS Legal Dashboard & Life Helper Guide

## ⚠️ IMPORTANT DISCLAIMER
**PURVIS is NOT a lawyer. Everything PURVIS produces is research assistance only — NOT legal advice. Always consult a licensed attorney in Florida or Kansas before filing anything or appearing in court.**

## Legal Dashboard
```
GET /api/legal/dashboard
```
Shows: your active cases, action items, official court portals, legal aid resources.

## Research a Legal Question
```
POST /api/legal/research
{"question": "What is Napue v. Illinois?", "state": "Florida", "caseNumber": "2024-DR-012028-O"}
```
Say: **"Research Florida family law rules on newly discovered evidence"**
Returns: plain English summary, relevant statutes, options, questions for your lawyer, next steps.

## Traffic/Legal Issue Help
```
POST /api/legal/traffic
{"description": "I got a speeding ticket in Orange County FL", "state": "Florida", "county": "Orange"}
```
Say: **"Help me understand my traffic ticket in Florida"**
Returns: plain English explanation, typical options, deadline guidance, questions for attorney, official links.

## Add a Case to Dashboard
```
POST /api/legal/cases
{"case_number": "2024-DR-012028-O", "case_type": "Family Law", "state": "Florida"}
```

## Official Florida Resources
- Orange County Court: https://myeclerk.myorangeclerk.com/
- Florida e-Filing: https://myflcourtaccess.com/
- Florida Statutes: http://www.leg.state.fl.us/statutes/
- Florida Legal Aid: https://floridalegal.org/
- Florida Bar Referral: https://www.floridabar.org/public/lawyer-referral/

## Official Kansas Resources
- Kansas Courts: https://www.kscourts.org/
- Kansas Legal Aid: https://www.klsinc.org/

## Daily Life Suggestions
```
POST /api/life/suggestions  ← generate today's action plan
GET /api/life/suggestions/today  ← get today's plan
```
Say: **"What should I do today?"** or **"Give me my action plan for today"**
PURVIS checks: active legal cases, new leads, draft content, overnight results → gives you 3 actions for today + 1 money move.
