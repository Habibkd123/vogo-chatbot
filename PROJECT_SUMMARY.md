# Vogo Chatbot Project Summary

## Overview
`vogo-chatbot` is a modern AI-powered chatbot platform built with Node.js and Express. It combines natural language processing, generative AI, voice integration, and a web chatbot UI to support shopping, calendar management, product search, and customer engagement.

## Main Technology Stack
- Node.js and Express
- Groq LLM and OpenAI / Gemini model support
- Natural language processing with `node-nlp`, `compromise`, and `franc`
- MySQL and SQLite support for database-backed features
- File uploads using `multer`
- REST API integration with Vogo Family backend services
- Voice backend support via Python server
- Webpack for frontend bundling

## Key Features
- Multi-intent chatbot with support for shopping list, agenda/calendar, product search, greetings, and fallback handling
- Intelligent fallback through Groq LLM for ambiguous queries and natural conversational responses
- Multilingual support across English, Romanian, Italian, French, German, and Spanish
- Auth guard and session-based login flow for protected user actions
- Smart QA cache for fast responses with pre-warmed question-answer pairs
- Image upload handling with strict file validation and size limits
- Configurable AI model routing and dynamic LLM selection via environment variables
- Optional voice input support using Python-based STT/voice backend

## Technologies Used
- JavaScript / Node.js
- Express.js
- Groq, OpenAI, Gemini APIs
- `node-nlp`, `compromise`, `franc`
- MySQL2, SQLite3
- `multer`, `cors`, `dotenv`, `form-data`
- Webpack, Nodemon

## My Role / Contribution
- Implemented the chatbot server and NLP workflow for intent detection and response generation
- Integrated Groq LLM with a custom prompt strategy for brand-specific conversations
- Built the auth guard and session management for secure chatbot actions
- Added multilingual fallback messaging and smart question-answer caching
- Coordinated voice backend support through a Python service proxy

## Outcome / Impact
- Delivered a modern conversational assistant tailored for the Vogo Family platform
- Enabled robust AI-driven responses and multilingual support for customer-facing interactions
- Created a flexible architecture that supports both text and voice chat experiences
