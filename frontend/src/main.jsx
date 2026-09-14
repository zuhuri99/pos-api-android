import Startup from "./components/Startup";
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { initializeNativeLinks } from './platform/lifecycle'

const favicon = import.meta.env.VITE_APP_FAVICON;
const title = import.meta.env.VITE_APP_TITLE;

if (favicon) {
  let link = document.querySelector("link[rel*='icon']");

  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }

  link.href = favicon;
}

if (title) {
  document.title = title;
}

initializeNativeLinks().catch(() => {});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Startup />
  </StrictMode>,
)
