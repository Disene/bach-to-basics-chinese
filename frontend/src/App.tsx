import { PracticeView } from "./views/PracticeView";
import { PracticeMemoryStatus } from "./components/PracticeMemory/PracticeMemoryStatus";
import "./components/Transport/noteLabelControls.css";
import "./components/PracticeMemory/practiceMemory.css";

export default function App() {
  return (
    <div className="practice-app-shell">
      <div className="practice-app-content"><PracticeView /></div>
      <PracticeMemoryStatus />
    </div>
  );
}
