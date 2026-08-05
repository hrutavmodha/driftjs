// src/main.js — DriftJS app entry point.
// Mounts the root page component into the #app element declared in index.html.

import { mount } from './drift-runtime.js';
import Home from './pages/Home.js';

mount(Home, document.getElementById('app'));
