import { useEffect, useState } from "react";

import { useAuth } from "../app/AuthContext";
import { AppCard } from "../components/AppCard";
import { CategoryTile } from "../components/CategoryTile";
import { HealthStatus } from "../components/HealthStatus";
import { MetricTile } from "../components/MetricTile";
import { PageContainer } from "../components/PageContainer";
import { getCategories } from "../services/categoriesApi";
import { useHealth } from "../services/useHealth";
import type { Category } from "../types/category";

const metricPlaceholders = [
  { label: "Ausgangsbetrag", value: "0,00 EUR", tone: "neutral" as const },
  { label: "Ausgaben", value: "0,00 EUR", tone: "warning" as const },
  { label: "Restbetrag", value: "0,00 EUR", tone: "positive" as const },
];

export function HomePage() {
  const health = useHealth();
  const { user } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoadingCategories, setIsLoadingCategories] = useState(true);
  const [categoryError, setCategoryError] = useState<string | null>(null);

  async function loadCategories() {
    setIsLoadingCategories(true);
    try {
      setCategories(await getCategories());
      setCategoryError(null);
    } catch {
      setCategoryError("Kategorien konnten nicht geladen werden.");
    } finally {
      setIsLoadingCategories(false);
    }
  }

  useEffect(() => {
    void loadCategories();
  }, []);

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
          <small>Auswahl vorbereitet</small>
        </div>
        {isLoadingCategories ? (
          <div className="category-grid" aria-label="Kategorien werden geladen">
            {[1, 2, 3, 4].map((item) => (
              <div className="category-skeleton" key={item} />
            ))}
          </div>
        ) : null}
        {categoryError ? (
          <div className="empty-state" role="alert">
            <p>{categoryError}</p>
            <button className="secondary-action" type="button" onClick={() => void loadCategories()}>
              Erneut laden
            </button>
          </div>
        ) : null}
        {!isLoadingCategories && !categoryError && categories.length === 0 ? (
          <p className="empty-state">
            {user?.role === "admin"
              ? "Noch keine Kategorien vorhanden. Lege in den Einstellungen eine Kategorie an."
              : "Noch keine Kategorien verfuegbar."}
          </p>
        ) : null}
        {!isLoadingCategories && !categoryError && categories.length > 0 ? (
          <div className="category-grid">
            {categories.map((category) => (
              <CategoryTile category={category} key={category.id} />
            ))}
          </div>
        ) : null}
      </AppCard>
    </PageContainer>
  );
}
