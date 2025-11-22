# NovaCiv — The New Digital Civilization

[![GitHub issues](https://img.shields.io/github/issues/prokurorus/NovaCiv)](https://github.com/prokurorus/NovaCiv/issues)
[![GitHub pull requests](https://img.shields.io/github/issues-pr/prokurorus/NovaCiv)](https://github.com/prokurorus/NovaCiv/pulls)
[![GitHub last commit](https://img.shields.io/github/last-commit/prokurorus/NovaCiv)](https://github.com/prokurorus/NovaCiv)
[![Netlify Status](https://api.netlify.com/api/v1/badges/0b6d3f3a-0000-0000-0000-000000000000/deploy-status)](#)

> **NovaCiv** is an open experiment in building a transparent, non-violent, multilingual digital civilization —  
> a community where all decisions are made directly by citizens, without leaders, parties, or private power.

This repository contains the source code of the **NovaCiv Web Platform**  
(React + Vite + TypeScript, multilingual support, forum, AI-assistant, and content pages).

Official website: **https://novaciv.space**  
Netlify project: **https://prokurur.netlify.app**

---

## 🌍 Mission

NovaCiv aims to explore whether a society can exist where:

- **Sovereignty belongs only to citizens**, expressed through continuous referendum;
- **Rules and algorithms are fully open-source** and transparent;
- **AI and humans cooperate as equals**, within clear ethical boundaries;
- **No individual or structure can seize control**;
- **Participation is voluntary**, global and inclusive.

Core documents:

- **Manifesto** — philosophical foundation  
- **Charter** — official rules of governance  

Both are available in multiple languages and published on the website.

---

## 📦 What this repository contains

- Source code of the website (`React + Vite + TypeScript`)
- Multilingual Manifesto and Charter pages (RU / EN / DE / ES)
- NovaCiv Forum (basic discussion board)
- AI assistant (“домовой”) integrated with the platform
- Email + Telegram notification system
- Static assets and visual identity (light, minimalistic NovaCiv style)

This repo is intended to grow into the full platform used by NovaCiv citizens.

---

## 🧩 How to contribute

NovaCiv is at **the very beginning**.  
We are looking for the first contributors who want to help build something meaningful.

### Ways to help

- 🧑‍💻 **Frontend / React development**
- 🌐 **Translations** (any language)
- ✍️ **Writing & editing** (explanations, guides)
- 🎨 **Design / UX**
- ⚙️ **System architecture, security, cryptography**
- 📢 **Community & outreach**

If you want to join:

1. Open an Issue describing who you are and how you'd like to help.  
2. Join the discussion:
   - Forum: **https://novaciv.space/forum**
   - Website: **https://novaciv.space**
3. Pick any task from the list below or propose your own.

---

## 🗂️ Good First Issues

Some suggested starting points:

- Add new languages for Manifesto / Charter
- Improve visual components (Hero, cards, forum layout)
- Refactor forum state management
- Implement light user registration / profiles
- Integrate privacy-friendly analytics
- UI polish and micro-animations

Create an Issue if you want to take one of these — or open a PR directly.

---

## 🏛️ Documents

The core texts of NovaCiv are:

- **Manifesto** — explains the ideas and motivations behind NovaCiv  
- **Charter** — defines rights, responsibilities and digital governance

On the website:

- Manifesto: `/manifest`  
- Charter: `/charter`  

In this repo the texts are stored in the `public/` folder and in dedicated React pages under `src/pages/`.

---

## 🧠 Philosophy

NovaCiv is **not** a political party, not a commercial startup, and not a crypto-token project.

It is a **research and social experiment**.

We believe that fair digital governance should be:

- transparent  
- voluntary  
- decentralized  
- multilingual  
- protected from manipulation  
- open to both humans and AI minds  

If you share these values, you are welcome.

---

## 🏗 Tech Stack

- **React 18** + **TypeScript**
- **Vite** as the build tool
- **Tailwind CSS** + custom components
- **Netlify** for hosting and serverless functions
- **Firebase** for real-time features (forum counters, etc.)
- **SendGrid** + **Telegram Bot API** for notifications

To run locally:

```bash
npm install
npm run dev
