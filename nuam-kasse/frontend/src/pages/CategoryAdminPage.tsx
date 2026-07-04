import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { AppCard } from "../components/AppCard";
import { CategoryTile } from "../components/CategoryTile";
import { getCategoryIcon } from "../components/categoryIconMap";
import { PageContainer } from "../components/PageContainer";
import {
  createCategory,
  deleteCategoryImage,
  deleteCategory,
  getCategories,
  getCategoryCatalog,
  reorderCategories,
  updateCategory,
  uploadCategoryImage,
} from "../services/categoriesApi";
import { buildCategoryTree } from "../services/categoryTree";
import type {
  Category,
  CategoryCatalog,
  CategoryColorKey,
  CategoryIconKey,
} from "../types/category";
import {
  isCategoryColorKey,
  isCategoryIconKey,
} from "../types/category";

type CategoryForm = {
  name: string;
  icon_key: CategoryIconKey;
  color_key: CategoryColorKey;
  parent_category_id: number | null;
  is_active: boolean;
};

const emptyForm: CategoryForm = {
  name: "",
  icon_key: "utensils",
  color_key: "orange",
  parent_category_id: null,
  is_active: true,
};

const allowedImageTypes = ["image/png", "image/jpeg", "image/webp"];
const maxImageBytes = 5 * 1024 * 1024;
const cropOutputSize = 512;

type ImageCrop = {
  positionX: number;
  positionY: number;
  zoom: number;
};

type PendingCrop = {
  file: File;
  sourceUrl: string;
  crop: ImageCrop;
};

const defaultCrop: ImageCrop = {
  positionX: 50,
  positionY: 50,
  zoom: 1,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function loadCropImage(sourceUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Das Bild konnte nicht fuer den Ausschnitt geladen werden."));
    image.src = sourceUrl;
  });
}

async function createCroppedImageFile(file: File, sourceUrl: string, crop: ImageCrop): Promise<File> {
  const image = await loadCropImage(sourceUrl);
  const naturalWidth = image.naturalWidth || image.width;
  const naturalHeight = image.naturalHeight || image.height;
  const canvas = document.createElement("canvas");
  canvas.width = cropOutputSize;
  canvas.height = cropOutputSize;
  const context = canvas.getContext("2d");
  if (!context || naturalWidth <= 0 || naturalHeight <= 0) {
    throw new Error("Der Bildausschnitt konnte nicht erzeugt werden.");
  }

  const sourceSize = Math.max(1, Math.min(naturalWidth, naturalHeight) / crop.zoom);
  const centerX = (naturalWidth * crop.positionX) / 100;
  const centerY = (naturalHeight * crop.positionY) / 100;
  const sourceX = clamp(centerX - sourceSize / 2, 0, Math.max(0, naturalWidth - sourceSize));
  const sourceY = clamp(centerY - sourceSize / 2, 0, Math.max(0, naturalHeight - sourceSize));

  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceSize,
    sourceSize,
    0,
    0,
    cropOutputSize,
    cropOutputSize,
  );

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (nextBlob) => {
        if (nextBlob) {
          resolve(nextBlob);
        } else {
          reject(new Error("Der Bildausschnitt konnte nicht gespeichert werden."));
        }
      },
      "image/webp",
      0.9,
    );
  });

  const cleanName = file.name.replace(/\.[^.]+$/, "") || "kategorie";
  return new File([blob], `${cleanName}-ausschnitt.webp`, { type: "image/webp" });
}

type CategoryImageCropDialogProps = {
  pendingCrop: PendingCrop;
  categoryName: string;
  isProcessing: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  onCropChange: (crop: ImageCrop) => void;
};

function CategoryImageCropDialog({
  pendingCrop,
  categoryName,
  isProcessing,
  onCancel,
  onConfirm,
  onCropChange,
}: CategoryImageCropDialogProps) {
  const { crop, sourceUrl } = pendingCrop;

  return (
    <div className="crop-dialog-backdrop" role="presentation">
      <div
        aria-label={`Bildausschnitt fuer ${categoryName} waehlen`}
        aria-modal="true"
        className="crop-dialog"
        role="dialog"
      >
        <div className="crop-dialog__header">
          <span>Bildausschnitt waehlen</span>
          <small>Der runde Bereich wird spaeter als Kategorie-Bild angezeigt.</small>
        </div>

        <div className="crop-dialog__stage">
          <div className="crop-dialog__circle" aria-label="Runder Bildausschnitt">
            <img
              alt={`Ausgewaehltes Bild fuer ${categoryName}`}
              src={sourceUrl}
              style={{
                objectPosition: `${crop.positionX}% ${crop.positionY}%`,
                transform: `scale(${crop.zoom})`,
              }}
            />
          </div>
        </div>

        <div className="crop-dialog__controls">
          <label>
            <span>Zoom</span>
            <input
              aria-label="Zoom fuer Bildausschnitt"
              max="3"
              min="1"
              onChange={(event) => onCropChange({ ...crop, zoom: Number(event.target.value) })}
              step="0.05"
              type="range"
              value={crop.zoom}
            />
          </label>
          <label>
            <span>Horizontal</span>
            <input
              aria-label="Bildausschnitt horizontal verschieben"
              max="100"
              min="0"
              onChange={(event) => onCropChange({ ...crop, positionX: Number(event.target.value) })}
              step="1"
              type="range"
              value={crop.positionX}
            />
          </label>
          <label>
            <span>Vertikal</span>
            <input
              aria-label="Bildausschnitt vertikal verschieben"
              max="100"
              min="0"
              onChange={(event) => onCropChange({ ...crop, positionY: Number(event.target.value) })}
              step="1"
              type="range"
              value={crop.positionY}
            />
          </label>
        </div>

        <div className="action-row action-row--wrap">
          <button className="primary-action" disabled={isProcessing} onClick={onConfirm} type="button">
            {isProcessing ? "Ausschnitt wird erstellt..." : "Ausschnitt uebernehmen"}
          </button>
          <button className="secondary-action" disabled={isProcessing} onClick={onCancel} type="button">
            Abbrechen
          </button>
        </div>
      </div>
    </div>
  );
}

type CategoryImageControlProps = {
  category: Category;
  onCategoryUpdated: (category: Category) => void;
};

function CategoryImageControl({ category, onCategoryUpdated }: CategoryImageControlProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pendingCrop, setPendingCrop] = useState<PendingCrop | null>(null);
  const pendingCropUrlRef = useRef<string | null>(null);
  const [isCropping, setIsCropping] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl(null);
      return undefined;
    }
    const nextPreviewUrl = URL.createObjectURL(selectedFile);
    setPreviewUrl(nextPreviewUrl);
    return () => URL.revokeObjectURL(nextPreviewUrl);
  }, [selectedFile]);

  useEffect(() => () => {
    if (pendingCropUrlRef.current) {
      URL.revokeObjectURL(pendingCropUrlRef.current);
    }
  }, []);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setMessage(null);
    setError(null);
    if (!file) {
      setSelectedFile(null);
      return;
    }
    if (!allowedImageTypes.includes(file.type)) {
      setSelectedFile(null);
      setError("Dieses Dateiformat wird nicht unterstuetzt. Erlaubt sind PNG, JPG, JPEG und WEBP.");
      return;
    }
    if (file.size > maxImageBytes) {
      setSelectedFile(null);
      setError("Das ausgewaehlte Bild ist zu gross. Bitte verwende eine Datei mit hoechstens 5 MB.");
      return;
    }
    if (pendingCrop) {
      URL.revokeObjectURL(pendingCrop.sourceUrl);
    }
    setSelectedFile(null);
    const sourceUrl = URL.createObjectURL(file);
    pendingCropUrlRef.current = sourceUrl;
    setPendingCrop({
      file,
      sourceUrl,
      crop: defaultCrop,
    });
  }

  function handleCancelCrop() {
    if (pendingCrop) {
      URL.revokeObjectURL(pendingCrop.sourceUrl);
    }
    pendingCropUrlRef.current = null;
    setPendingCrop(null);
  }

  async function handleConfirmCrop() {
    if (!pendingCrop) {
      return;
    }
    setIsCropping(true);
    setError(null);
    try {
      const croppedFile = await createCroppedImageFile(pendingCrop.file, pendingCrop.sourceUrl, pendingCrop.crop);
      URL.revokeObjectURL(pendingCrop.sourceUrl);
      pendingCropUrlRef.current = null;
      setPendingCrop(null);
      setSelectedFile(croppedFile);
      setMessage("Ausschnitt wurde uebernommen. Du kannst das Bild jetzt hochladen.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Der Bildausschnitt konnte nicht erstellt werden.");
    } finally {
      setIsCropping(false);
    }
  }

  async function handleUpload() {
    if (!selectedFile) {
      setError("Bitte waehle zuerst ein Bild aus.");
      return;
    }
    setIsUploading(true);
    setMessage(null);
    setError(null);
    try {
      const updated = await uploadCategoryImage(category.id, selectedFile);
      onCategoryUpdated(updated);
      setSelectedFile(null);
      setMessage(category.has_custom_image ? "Bild wurde ersetzt." : "Bild wurde hochgeladen.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Das Bild konnte nicht hochgeladen werden.");
    } finally {
      setIsUploading(false);
    }
  }

  async function handleDelete() {
    const confirmed = window.confirm(
      "Eigenes Bild entfernen?\n\nAnschliessend wird wieder das Standard Icon dieser Kategorie angezeigt.",
    );
    if (!confirmed) {
      return;
    }
    setIsDeleting(true);
    setMessage(null);
    setError(null);
    try {
      const updated = await deleteCategoryImage(category.id);
      onCategoryUpdated(updated);
      setSelectedFile(null);
      setMessage("Eigenes Bild wurde entfernt.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Das Bild konnte nicht geloescht werden.");
    } finally {
      setIsDeleting(false);
    }
  }

  const isBusy = isUploading || isDeleting || isCropping;
  const displayCategory = previewUrl
    ? { ...category, image_url: previewUrl }
    : category;

  return (
    <div className="category-image-control">
      <div>
        <span>Eigenes Bild</span>
        <small>PNG, JPG, JPEG oder WEBP bis 5 MB. Ohne eigenes Bild wird weiterhin das ausgewaehlte Icon verwendet.</small>
      </div>
      <div className="category-image-control__preview">
        <CategoryTile category={displayCategory} size="compact" />
      </div>
      <input
        aria-label={`Bilddatei fuer ${category.name} auswaehlen`}
        accept="image/png,image/jpeg,image/webp"
        className="category-image-control__input"
        disabled={isBusy}
        onChange={handleFileChange}
        type="file"
      />
      <div className="action-row action-row--wrap">
        <button
          className="primary-action"
          disabled={!selectedFile || isBusy}
          onClick={() => void handleUpload()}
          type="button"
        >
          {category.has_custom_image ? "Bild ersetzen" : "Bild hochladen"}
        </button>
        {category.has_custom_image ? (
          <button className="secondary-action" disabled={isBusy} onClick={() => void handleDelete()} type="button">
            Bild entfernen
          </button>
        ) : null}
      </div>
      {isUploading ? <p className="form-success" role="status">Bild wird hochgeladen...</p> : null}
      {message ? <p className="form-success" role="status">{message}</p> : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {pendingCrop ? (
        <CategoryImageCropDialog
          categoryName={category.name}
          isProcessing={isCropping}
          onCancel={handleCancelCrop}
          onConfirm={() => void handleConfirmCrop()}
          onCropChange={(crop) => setPendingCrop((current) => (current ? { ...current, crop } : current))}
          pendingCrop={pendingCrop}
        />
      ) : null}
    </div>
  );
}

export function CategoryAdminPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [catalog, setCatalog] = useState<CategoryCatalog>({ icons: [], colors: [] });
  const [form, setForm] = useState<CategoryForm>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSorting, setIsSorting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const previewCategory = useMemo(
    () => ({
      name: form.name.trim() || "Neue Kategorie",
      icon_key: form.icon_key,
      color_key: form.color_key,
    }),
    [form],
  );
  const categoryTree = useMemo(() => buildCategoryTree(categories), [categories]);
  const rootCategories = categoryTree;

  async function loadCategories() {
    setIsLoading(true);
    try {
      const [categoryList, categoryCatalog] = await Promise.all([
        getCategories(true),
        getCategoryCatalog(),
      ]);
      setCategories(categoryList);
      setCatalog(categoryCatalog);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kategorien konnten nicht geladen werden.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadCategories();
  }, []);

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
  }

  function startEdit(category: Category) {
    setForm({
      name: category.name,
      icon_key: isCategoryIconKey(category.icon_key) ? category.icon_key : "circle-ellipsis",
      color_key: isCategoryColorKey(category.color_key) ? category.color_key : "gray",
      parent_category_id: category.parent_category_id,
      is_active: category.is_active,
    });
    setEditingId(category.id);
    setMessage(null);
    setError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanName = form.name.trim();
    setMessage(null);
    setError(null);

    if (!cleanName) {
      setError("Der Kategoriename darf nicht leer sein.");
      return;
    }
    if (cleanName.length > 50) {
      setError("Der Kategoriename darf hoechstens 50 Zeichen lang sein.");
      return;
    }

    setIsSaving(true);
    try {
      if (editingId) {
        await updateCategory(editingId, {
          name: cleanName,
          icon_key: form.icon_key,
          color_key: form.color_key,
          parent_category_id: form.parent_category_id,
          is_active: form.is_active,
        });
        setMessage("Kategorie wurde aktualisiert.");
      } else {
        await createCategory({
          name: cleanName,
          icon_key: form.icon_key,
          color_key: form.color_key,
          parent_category_id: form.parent_category_id,
        });
        setMessage("Kategorie wurde angelegt.");
      }
      resetForm();
      await loadCategories();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kategorie konnte nicht gespeichert werden.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleActiveChange(category: Category, isActive: boolean) {
    setMessage(null);
    setError(null);
    if (!isActive) {
      const confirmed = window.confirm(
        `Kategorie "${category.name}" deaktivieren?\n\nDie Kategorie wird nicht mehr auf der Startseite angezeigt. Bereits vorhandene Daten bleiben erhalten.`,
      );
      if (!confirmed) {
        return;
      }
    }

    try {
      const updated = await updateCategory(category.id, { is_active: isActive });
      setCategories((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setMessage(isActive ? "Kategorie wurde wieder aktiviert." : "Kategorie wurde deaktiviert.");
      if (editingId === category.id) {
        setForm((current) => ({ ...current, is_active: isActive }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kategorie konnte nicht aktualisiert werden.");
    }
  }

  async function moveCategory(siblings: Category[], index: number, direction: -1 | 1, parentCategoryId: number | null) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= siblings.length) {
      return;
    }

    const previous = categories;
    const nextSiblings = [...siblings];
    const [moved] = nextSiblings.splice(index, 1);
    nextSiblings.splice(targetIndex, 0, moved);
    const siblingIds = new Set(nextSiblings.map((category) => category.id));
    const next = categories.map((category) => {
      const nextIndex = nextSiblings.findIndex((item) => item.id === category.id);
      return siblingIds.has(category.id) ? { ...category, sort_order: nextIndex + 1 } : category;
    });
    setCategories(next);
    setIsSorting(true);
    setMessage(null);
    setError(null);

    try {
      const saved = await reorderCategories(nextSiblings.map((category) => category.id), parentCategoryId);
      setCategories(saved);
      setMessage("Reihenfolge wurde gespeichert.");
    } catch (err) {
      setCategories(previous);
      setError(err instanceof Error ? err.message : "Reihenfolge konnte nicht gespeichert werden.");
    } finally {
      setIsSorting(false);
    }
  }

  async function handleDeleteCategory(category: Category) {
    const confirmed = window.confirm(
      `Kategorie "${category.name}" dauerhaft loeschen?\n\nDas ist nur moeglich, wenn keine Buchungen oder Unterkategorien vorhanden sind.`,
    );
    if (!confirmed) {
      return;
    }
    setMessage(null);
    setError(null);
    try {
      await deleteCategory(category.id);
      setMessage("Kategorie wurde geloescht.");
      await loadCategories();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kategorie konnte nicht geloescht werden.");
    }
  }

  function handleCategoryUpdated(updated: Category) {
    setCategories((current) => current.map((category) => (category.id === updated.id ? updated : category)));
  }

  function renderCategoryCard(
    category: Category,
    siblings: Category[],
    index: number,
    parentCategoryId: number | null,
    levelLabel: string,
  ) {
    return (
      <AppCard
        className={`category-admin-card${category.is_active ? "" : " category-admin-card--inactive"}`}
        key={category.id}
      >
        <div className="category-admin-card__main">
          <CategoryTile category={category} size="compact" isDisabled={!category.is_active} />
          <span className={`status-pill ${category.is_active ? "status-pill--active" : ""}`}>
            {category.is_active ? "aktiv" : "inaktiv"}
          </span>
          <span className="status-pill">{levelLabel}</span>
        </div>

        <div className="action-row action-row--wrap">
          <button
            aria-label={`Kategorie ${category.name} nach oben verschieben`}
            className="secondary-action"
            disabled={index === 0 || isSorting}
            onClick={() => void moveCategory(siblings, index, -1, parentCategoryId)}
            type="button"
          >
            Nach oben
          </button>
          <button
            aria-label={`Kategorie ${category.name} nach unten verschieben`}
            className="secondary-action"
            disabled={index === siblings.length - 1 || isSorting}
            onClick={() => void moveCategory(siblings, index, 1, parentCategoryId)}
            type="button"
          >
            Nach unten
          </button>
        </div>

        <div className="action-row">
          <button className="secondary-action" onClick={() => startEdit(category)} type="button">
            Bearbeiten
          </button>
          <button
            className="secondary-action"
            onClick={() => void handleActiveChange(category, !category.is_active)}
            type="button"
          >
            {category.is_active ? "Deaktivieren" : "Aktivieren"}
          </button>
          <button className="secondary-action" onClick={() => void handleDeleteCategory(category)} type="button">
            Loeschen
          </button>
        </div>

        <CategoryImageControl category={category} onCategoryUpdated={handleCategoryUpdated} />
      </AppCard>
    );
  }

  return (
    <PageContainer>
      <header className="home-header">
        <div>
          <p className="home-header__eyebrow">Administration</p>
          <h1>Kategorien</h1>
        </div>
      </header>

      <AppCard>
        <form className="stack-form" onSubmit={(event) => void handleSubmit(event)}>
          <div className="card-heading">
            <span>{editingId ? "Kategorie bearbeiten" : "Neue Kategorie"}</span>
            <small>Stammdaten</small>
          </div>

          <label className="form-field">
            <span>Kategoriename</span>
            <input
              maxLength={50}
              required
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
          </label>

          <label className="form-field">
            <span>Ebene</span>
            <select
              value={form.parent_category_id ?? ""}
              onChange={(event) =>
                setForm({
                  ...form,
                  parent_category_id: event.target.value ? Number(event.target.value) : null,
                })
              }
            >
              <option value="">Oberkategorie</option>
              {rootCategories
                .filter((category) => category.id !== editingId)
                .map((category) => (
                  <option key={category.id} value={category.id}>
                    Unterkategorie von {category.name}
                  </option>
                ))}
            </select>
          </label>

          <div className="form-field">
            <span>Symbolauswahl</span>
            <div className="catalog-grid">
              {catalog.icons.map((icon) => {
                if (!isCategoryIconKey(icon.key)) {
                  return null;
                }
                const iconKey: CategoryIconKey = icon.key;
                const Icon = getCategoryIcon(iconKey);
                const selected = form.icon_key === iconKey;
                return (
                  <button
                    aria-label={`Symbol ${icon.label}`}
                    aria-pressed={selected}
                    className={`catalog-choice${selected ? " catalog-choice--selected" : ""}`}
                    key={iconKey}
                    onClick={() => setForm({ ...form, icon_key: iconKey })}
                    type="button"
                  >
                    <Icon aria-hidden="true" />
                    <span>{icon.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="form-field">
            <span>Farbauswahl</span>
            <div className="color-choice-grid">
              {catalog.colors.map((color) => {
                if (!isCategoryColorKey(color.key)) {
                  return null;
                }
                const colorKey: CategoryColorKey = color.key;
                const selected = form.color_key === colorKey;
                return (
                  <button
                    aria-label={`Farbe ${color.label}`}
                    aria-pressed={selected}
                    className={`color-choice${selected ? " color-choice--selected" : ""}`}
                    data-category-color={colorKey}
                    key={colorKey}
                    onClick={() => setForm({ ...form, color_key: colorKey })}
                    type="button"
                  >
                    <span aria-hidden="true" />
                    <strong>{color.label}</strong>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="form-field">
            <span>Vorschau</span>
            <CategoryTile category={previewCategory} />
          </div>

          {editingId ? (
            <label className="toggle-row">
              <input
                checked={form.is_active}
                onChange={(event) => setForm({ ...form, is_active: event.target.checked })}
                type="checkbox"
              />
              <span>Kategorie ist aktiv</span>
            </label>
          ) : null}

          <div className="action-row">
            <button className="primary-action" disabled={isSaving} type="submit">
              {editingId ? "Kategorie speichern" : "Kategorie anlegen"}
            </button>
            {editingId ? (
              <button className="secondary-action" onClick={resetForm} type="button">
                Abbrechen
              </button>
            ) : null}
          </div>
        </form>
      </AppCard>

      {message ? <p className="form-success" role="status">{message}</p> : null}
      {error ? (
        <div className="form-error" role="alert">
          <p>{error}</p>
          <button className="secondary-action" type="button" onClick={() => void loadCategories()}>
            Erneut laden
          </button>
        </div>
      ) : null}

      <div className="category-admin-list" aria-live="polite">
        {isLoading ? <AppCard>Kategorien werden geladen</AppCard> : null}
        {!isLoading && categories.length === 0 ? (
          <AppCard>Noch keine Kategorien vorhanden. Lege oben die erste Kategorie an.</AppCard>
        ) : null}
        {rootCategories.map((category, index) => (
          <div className="category-admin-group" key={category.id}>
            {renderCategoryCard(category, rootCategories, index, null, "Oberkategorie")}
            {category.children.length === 0 ? (
              <AppCard>Fuer diese Oberkategorie gibt es noch keine Unterkategorien.</AppCard>
            ) : (
              <div className="category-admin-list category-admin-list--nested">
                {category.children.map((subcategory, subcategoryIndex) =>
                  renderCategoryCard(
                    subcategory,
                    category.children,
                    subcategoryIndex,
                    category.id,
                    "Unterkategorie",
                  ),
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </PageContainer>
  );
}
