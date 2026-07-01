import { AppCard } from "../components/AppCard";
import { PageContainer } from "../components/PageContainer";

type PlaceholderPageProps = {
  title: string;
};

export function PlaceholderPage({ title }: PlaceholderPageProps) {
  return (
    <PageContainer>
      <header className="home-header">
        <div>
          <p className="home-header__eyebrow">Noch nicht implementiert</p>
          <h1>{title}</h1>
        </div>
      </header>
      <AppCard>
        <p className="placeholder-copy">
          Dieses Modul ist für einen späteren Arbeitsschritt reserviert.
        </p>
      </AppCard>
    </PageContainer>
  );
}
