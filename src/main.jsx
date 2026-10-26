import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import Boundary from './components/Boundary.jsx';
import './index.css';

createRoot(document.getElementById('root')).render(
  <Boundary>
    <App />
  </Boundary>,
);
