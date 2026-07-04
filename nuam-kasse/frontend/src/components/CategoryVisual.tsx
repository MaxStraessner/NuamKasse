import { useEffect, useState } from "react";

import { getCategoryIcon } from "./categoryIconMap";

type CategoryVisualProps = {
  icon: string;
  imageUrl?: string | null;
  name?: string;
  className?: string;
};

export function CategoryVisual({
  icon,
  imageUrl,
  name,
  className = "",
}: CategoryVisualProps) {
  const [hasImageError, setHasImageError] = useState(false);
  const Icon = getCategoryIcon(icon);
  const shouldShowImage = Boolean(imageUrl) && !hasImageError;

  useEffect(() => {
    setHasImageError(false);
  }, [imageUrl]);

  return (
    <span className={`category-visual${className ? ` ${className}` : ""}`}>
      {shouldShowImage ? (
        <img
          alt={name ? `Bild der Kategorie ${name}` : ""}
          className="category-visual__image"
          onError={() => setHasImageError(true)}
          src={imageUrl ?? undefined}
        />
      ) : (
        <Icon aria-hidden="true" strokeWidth={2.35} />
      )}
    </span>
  );
}
