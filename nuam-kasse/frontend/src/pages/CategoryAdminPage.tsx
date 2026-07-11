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
const minCropZoom = 0.5;

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
  const sourceX = clamp(
    centerX - sourceSize / 2,
    Math.min(0, naturalWidth - sourceSize),
    Math.max(0, naturalWidth - sourceSize),
  );
  const sourceY = clamp(
    centerY - sourceSize / 2,
    Math.min(0, naturalHeight - sourceSize),
    Math.max(0, naturalHeight - sourceSize),
  );

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
              min={minCropZoom}
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

type CategoryFormDialogProps = {
  mode: "create" | "edit";
  category: Category | null;
  catalog: CategoryCatalog;
  form: CategoryForm;
  rootCategories: Category[];
  isSaving: boolean;
  onCancel: () => void;
  onCategoryUpdated: (category: Category) => void;
  onFormChange: (form: CategoryForm) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

function CategoryFormDialog({
  mode,
  category,
  catalog,
  form,
  rootCategories,
  isSaving,
  onCancel,
  onCategoryUpdated,
  onFormChange,
  onSubmit,
}: CategoryFormDialogProps) {
  const previewCategory = {
    name: form.name.trim() || "Neue Kategorie",
    icon_key: form.icon_key,
    color_key: form.color_key,
    image_url: category?.image_url ?? null,
  };
  const title = mode === "edit" ? "Kategorie bearbeiten" : "Neue Kategorie";

  return (
    <div className="dialog-backdrop category-dialog-backdrop" role="presentation">
      <div aria-label={title} aria-modal="true" className="category-dialog" role="dialog">
        <form className="stack-form" onSubmit={(event) => onSubmit(event)}>
          <div className="card-heading">
            <span>{title}</span>
            <small>{mode === "edit" ? category?.name : "Stammdaten"}</small>
          </div>

          <label className="form-field">
            <span>Kategoriename</span>
            <input
              maxLength={50}
              required
              value={form.name}
              onChange={(event) => onFormChange({ ...form, name: event.target.value })}
            />
          </label>

          <label className="form-field">
            <span>Ebene</span>
            <select
              value={form.parent_category_id ?? ""}
              onChange={(event) =>
                onFormChange({
                  ...form,
                  parent_category_id: event.target.value ? Number(event.target.value) : null,
                })
              }
            >
              <option value="">Oberkategorie</option>
              {rootCategories
                .filter((rootCategory) => rootCategory.id !== category?.id)
                .map((rootCategory) => (
                  <option key={rootCategory.id} value={rootCategory.id}>
                    Unterkategorie von {rootCategory.name}
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
                    onClick={() => onFormChange({ ...form, icon_key: iconKey })}
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
                    onClick={() => onFormChange({ ...form, color_key: colorKey })}
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

          {mode === "edit" ? (
            <label className="toggle-row">
              <input
                checked={form.is_active}
                onChange={(event) => onFormChange({ ...form, is_active: event.target.checked })}
                type="checkbox"
              />
              <span>Kategorie ist aktiv</span>
            </label>
          ) : null}

          <div className="action-row action-row--wrap">
            <button className="primary-action" disabled={isSaving} type="submit">
              {mode === "edit" ? "Kategorie speichern" : "Kategorie anlegen"}
            </button>
            <button className="secondary-action" disabled={isSaving} onClick={onCancel} type="button">
              Abbrechen
            </button>
          </div>
        </form>

        {mode === "edit" && category ? (
          <CategoryImageControl category={category} onCategoryUpdated={onCategoryUpdated} />
        ) : null}
      </div>
    </div>
  );
}

type ConfirmDeleteDialogProps = {
  category: Category;
  subcategoryCount: number;
  isDeleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

function ConfirmDeleteDialog({
  category,
  subcategoryCount,
  isDeleting,
  onCancel,
  onConfirm,
}: ConfirmDeleteDialogProps) {
  return (
    <div className="dialog-backdrop category-dialog-backdrop" role="presentation">
      <div aria-label={`Kategorie ${category.name} loeschen`} aria-modal="true" className="category-confirm-dialog" role="dialog">
        <div className="card-heading">
          <span>Kategorie loeschen?</span>
          <small>{category.name}</small>
        </div>
        <p className="category-confirm-dialog__copy">
          Die Kategorie "{category.name}" wird dauerhaft geloescht. Diese Aktion soll nicht unbeabsichtigt ausgefuehrt werden.
        </p>
        <p className="category-confirm-dialog__copy">
          {subcategoryCount > 0
            ? `${subcategoryCount} Unterkategorie${subcategoryCount === 1 ? "" : "n"} sind betroffen. Wenn die bestehende Logik das Loeschen verhindert, bleibt die Kategorie erhalten.`
            : "Es sind keine Unterkategorien betroffen."}
        </p>
        <div className="action-row action-row--wrap">
          <button className="primary-action category-danger-action" disabled={isDeleting} onClick={onConfirm} type="button">
            {isDeleting ? "Wird geloescht..." : "Kategorie loeschen"}
          </button>
          <button className="secondary-action" disabled={isDeleting} onClick={onCancel} type="button">
            Abbrechen
          </button>
        </div>
      </div>
    </div>
  );
}

export function CategoryAdminPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [catalog, setCatalog] = useState<CategoryCatalog>({ icons: [], colors: [] });
  const [form, setForm] = useState<CategoryForm>(emptyForm);
  const [dialogMode, setDialogMode] = useState<"create" | "edit" | null>(null);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSorting, setIsSorting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  function closeDialog() {
    setDialogMode(null);
    setEditingCategory(null);
    setForm(emptyForm);
  }

  function startCreate() {
    setForm(emptyForm);
    setEditingCategory(null);
    setDialogMode("create");
    setMessage(null);
    setError(null);
  }

  function startEdit(category: Category) {
    setForm({
      name: category.name,
      icon_key: isCategoryIconKey(category.icon_key) ? category.icon_key : "circle-ellipsis",
      color_key: isCategoryColorKey(category.color_key) ? category.color_key : "gray",
      parent_category_id: category.parent_category_id,
      is_active: category.is_active,
    });
    setEditingCategory(category);
    setDialogMode("edit");
    setMessage(null);
    setError(null);
  }

  function toggleCategory(categoryId: number) {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
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
      if (dialogMode === "edit" && editingCategory) {
        await updateCategory(editingCategory.id, {
          name: cleanName,
          icon_key: form.icon_key,
          color_key: form.color_key,
          parent_category_id: form.parent_category_id,
          is_active: form.is_active,
        });
        setMessage("Kategorie wurde aktualisiert.");
      } else {
        const created = await createCategory({
          name: cleanName,
          icon_key: form.icon_key,
          color_key: form.color_key,
          parent_category_id: form.parent_category_id,
        });
        if (created.parent_category_id) {
          setExpandedIds((current) => new Set(current).add(created.parent_category_id!));
        }
        setMessage("Kategorie wurde angelegt.");
      }
      closeDialog();
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
      if (editingCategory?.id === category.id) {
        setEditingCategory(updated);
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

  async function handleConfirmDeleteCategory() {
    if (!deleteTarget) {
      return;
    }
    setIsDeleting(true);
    setMessage(null);
    setError(null);
    try {
      await deleteCategory(deleteTarget.id);
      setDeleteTarget(null);
      setMessage("Kategorie wurde geloescht.");
      await loadCategories();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kategorie konnte nicht geloescht werden.");
    } finally {
      setIsDeleting(false);
    }
  }

  function handleCategoryUpdated(updated: Category) {
    setCategories((current) => current.map((category) => (category.id === updated.id ? updated : category)));
    if (editingCategory?.id === updated.id) {
      setEditingCategory(updated);
    }
  }

  function getSubcategoryCount(category: Category) {
    return categories.filter((item) => item.parent_category_id === category.id).length;
  }

  function renderCategoryActions(
    category: Category,
    siblings: Category[],
    index: number,
    parentCategoryId: number | null,
  ) {
    return (
      <div className="category-actions">
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
        <button className="secondary-action" onClick={() => setDeleteTarget(category)} type="button">
          Loeschen
        </button>
      </div>
    );
  }

  function renderSubcategoryRow(subcategory: Category, siblings: Category[], index: number, parentCategoryId: number) {
    return (
      <div className={`subcategory-row${subcategory.is_active ? "" : " subcategory-row--inactive"}`} key={subcategory.id}>
        <div className="subcategory-row__summary">
          <CategoryTile category={subcategory} size="compact" isDisabled={!subcategory.is_active} />
          <span className={`status-pill ${subcategory.is_active ? "status-pill--active" : ""}`}>
            {subcategory.is_active ? "aktiv" : "inaktiv"}
          </span>
        </div>
        {renderCategoryActions(subcategory, siblings, index, parentCategoryId)}
      </div>
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

      <AppCard className="category-create-panel">
        <button className="primary-action" onClick={startCreate} type="button">
          Neue Kategorie erstellen
        </button>
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
          <AppCard>Noch keine Kategorien vorhanden. Erstelle deine erste Kategorie.</AppCard>
        ) : null}
        {rootCategories.map((category, index) => {
          const isExpanded = expandedIds.has(category.id);
          const panelId = `category-panel-${category.id}`;
          return (
            <AppCard
              className={`category-accordion-item${category.is_active ? "" : " category-accordion-item--inactive"}`}
              key={category.id}
            >
              <button
                aria-controls={panelId}
                aria-expanded={isExpanded}
                className="category-accordion-item__header"
                onClick={() => toggleCategory(category.id)}
                type="button"
              >
                <CategoryTile category={category} size="compact" isDisabled={!category.is_active} />
                <span className="category-accordion-item__meta">
                  <strong>{category.children.length}</strong>
                  <small>Unterkategorie{category.children.length === 1 ? "" : "n"}</small>
                </span>
                <span className={`status-pill ${category.is_active ? "status-pill--active" : ""}`}>
                  {category.is_active ? "aktiv" : "inaktiv"}
                </span>
                <span className="category-accordion-item__chevron" aria-hidden="true">
                  {isExpanded ? "v" : ">"}
                </span>
              </button>

              {isExpanded ? (
                <div className="category-accordion-item__panel" id={panelId}>
                  {renderCategoryActions(category, rootCategories, index, null)}
                  {category.children.length === 0 ? (
                    <p className="category-empty-note">Noch keine Unterkategorien.</p>
                  ) : (
                    <div className="subcategory-list">
                      {category.children.map((subcategory, subcategoryIndex) =>
                        renderSubcategoryRow(subcategory, category.children, subcategoryIndex, category.id),
                      )}
                    </div>
                  )}
                </div>
              ) : null}
            </AppCard>
          );
        })}
      </div>

      {dialogMode ? (
        <CategoryFormDialog
          catalog={catalog}
          category={editingCategory}
          form={form}
          isSaving={isSaving}
          mode={dialogMode}
          onCancel={closeDialog}
          onCategoryUpdated={handleCategoryUpdated}
          onFormChange={setForm}
          onSubmit={(event) => void handleSubmit(event)}
          rootCategories={rootCategories}
        />
      ) : null}

      {deleteTarget ? (
        <ConfirmDeleteDialog
          category={deleteTarget}
          isDeleting={isDeleting}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => void handleConfirmDeleteCategory()}
          subcategoryCount={getSubcategoryCount(deleteTarget)}
        />
      ) : null}
    </PageContainer>
  );
}
