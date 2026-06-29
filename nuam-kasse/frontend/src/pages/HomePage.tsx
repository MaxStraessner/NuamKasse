import { AppCard } from "../components/AppCard";
import { HealthStatus } from "../components/HealthStatus";
import { MetricTile } from "../components/MetricTile";
import { PageContainer } from "../components/PageContainer";
import { useHealth } from "../services/useHealth";

const metricPlaceholders = [
  { label: "Ausgangsbetrag", value: "0,00 EUR", tone: "neutral" as const },
  { label: "Ausgaben", value: "0,00 EUR", tone: "warning" as const },
  { label: "Restbetrag", value: "0,00 EUR", tone: "positive" as const },
];

const categoryPlaceholders = ["Kategorie 1", "Kategorie 2", "Kategorie 3", "Kategorie 4"];

export function HomePage() {
  const health = useHealth();

  return (
    <PageContainer>
      <header className="home-header">
        <div>
          <p className="home-header__eyebrow">Gemeinsame Kasse</p>
          <h1>Nuam Kasse</h1>
        </div>
        <HealthStatus status={health.status} health={health.data} />
      </header>

      <AppCard ariaLabel="Kassenuebersicht">
        <div className="card-heading">
          <span>Aktuelle Kasse</span>
          <small>Technische Vorschau</small>
        </div>
        <div className="metric-grid">
          {metricPlaceholders.map((metric) => (
            <MetricTile key={metric.label} {...metric} />
          ))}
        </div>
      </AppCard>

      <AppCard className="category-card" ariaLabel="Kategoriesymbole">
        <div className="card-heading">
          <span>Kategorien</span>
          <small>Platz fuer spaetere Symbole</small>
        </div>
        <div className="category-grid">
          {categoryPlaceholders.map((label, index) => (
            <button className="category-placeholder" key={label} type="button" disabled>
              <span aria-hidden="true">{index + 1}</span>
              <strong>{label}</strong>
            </button>
          ))}
        </div>
      </AppCard>
    </PageContainer>
  );
}
