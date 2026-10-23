import { Footer } from "./components/Footer";
import { Header } from "./components/Header";
import { SetupScreen } from "./components/SetupScreen";

export default function App() {
  return (
    <div className="app">
      <div className="panel">
        <Header />
        <SetupScreen />
        <Footer />
      </div>
    </div>
  );
}
