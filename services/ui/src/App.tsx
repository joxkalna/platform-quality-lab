import Classify from "./components/Classify/Classify";
import DataPanel from "./components/DataPanel/DataPanel";
import HealthStatus from "./components/HealthStatus/HealthStatus";

const App = () => (
  <div className="max-w-3xl mx-auto px-4 py-8">
    <header className="mb-8">
      <h1 className="text-2xl font-bold">Platform Quality Lab</h1>
      <p className="text-gray-400 text-sm mt-1">
        Microservices + LLM classification on Kubernetes
      </p>
    </header>

    <div className="space-y-6">
      <Classify />
      <DataPanel />
      <HealthStatus />
    </div>
  </div>
);

export default App;
