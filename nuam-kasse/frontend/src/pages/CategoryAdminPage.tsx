import { ChangeEvent, FormEvent, PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Pencil, Plus, Power, Search, Trash2 } from "lucide-react";

import { AppCard } from "../components/AppCard";
import { AppDialog } from "../components/AppDialog";
import { CategoryTile } from "../components/CategoryTile";
import { getCategoryIcon } from "../components/categoryIconMap";
import { PageContainer } from "../components/PageContainer";
import { PageHeader } from "../components/PageHeader";
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
const minCropZoom = 1;

type ImageCrop = {
  offsetX: number;
  offsetY: number;
  zoom: number;
};

type PendingCrop = {
  file: File;
  sourceUrl: string;
  naturalWidth: number;
  naturalHeight: number;
  crop: ImageCrop;
};

const defaultCrop: ImageCrop = {
  offsetX: 0,
  offsetY: 0,
  zoom: 1,
};

function loadCropImage(sourceUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Das Bild konnte nicht für den Ausschnitt geladen werden."));
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

  // Zoom is relative to a contain fit: zoom 1 always shows the complete original.
  // Offsets are stored as fractions of the circular viewport, independent of its CSS size.
  const sourceSize = Math.max(1, Math.max(naturalWidth, naturalHeight) / crop.zoom);
  const centerX = naturalWidth / 2 - (crop.offsetX * Math.max(naturalWidth, naturalHeight)) / crop.zoom;
  const centerY = naturalHeight / 2 - (crop.offsetY * Math.max(naturalWidth, naturalHeight)) / crop.zoom;
  const sourceX = centerX - sourceSize / 2;
  const sourceY = centerY - sourceSize / 2;

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
  const { crop, sourceUrl, naturalWidth, naturalHeight } = pendingCrop;
  const dragRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const longestSide = Math.max(naturalWidth, naturalHeight);
  const baseWidth = naturalWidth / longestSide;
  const baseHeight = naturalHeight / longestSide;
  const coverZoom = longestSide / Math.min(naturalWidth, naturalHeight);
  const maxZoom = Math.max(8, coverZoom * 4);

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const size = event.currentTarget.getBoundingClientRect().width;
    if (size <= 0) return;
    onCropChange({
      ...crop,
      offsetX: crop.offsetX + (event.clientX - drag.x) / size,
      offsetY: crop.offsetY + (event.clientY - drag.y) / size,
    });
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
  }

  function handlePointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  }

  return (
    <AppDialog className="crop-dialog" description={`Ziehe das Originalbild für ${categoryName} in Position. Der Kreis zeigt nur den späteren Ausschnitt.`} isOpen onClose={onCancel} preventClose={isProcessing} title="Bildausschnitt wählen">
        <div className="crop-dialog__stage">
          <div
            className="crop-dialog__circle"
            aria-label="Runder Bildausschnitt"
            onPointerCancel={handlePointerEnd}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerEnd}
          >
            <img
              draggable="false"
              alt={`Ausgewähltes Bild für ${categoryName}`}
              src={sourceUrl}
              style={{
                height: `${baseHeight * crop.zoom * 100}%`,
                left: `${50 + crop.offsetX * 100}%`,
                top: `${50 + crop.offsetY * 100}%`,
                width: `${baseWidth * crop.zoom * 100}%`,
              }}
            />
          </div>
        </div>

        <div className="crop-dialog__controls">
          <label>
            <span>Zoom</span>
            <input
              aria-label="Zoom für Bildausschnitt"
              max={maxZoom}
              min={minCropZoom}
              onChange={(event) => onCropChange({ ...crop, zoom: Number(event.target.value) })}
              step="0.05"
              type="range"
              value={crop.zoom}
            />
          </label>
          <small className="crop-dialog__hint">Ganz links siehst du immer das vollständige Originalbild.</small>
        </div>

        <div className="action-row action-row--wrap">
          <button className="primary-action" disabled={isProcessing} onClick={onConfirm} type="button">
            {isProcessing ? "Ausschnitt wird erstellt …" : "Ausschnitt übernehmen"}
          </button>
          <button className="secondary-action" disabled={isProcessing} onClick={onCancel} type="button">
            Abbrechen
          </button>
        </div>
    </AppDialog>
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
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
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

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setMessage(null);
    setError(null);
    if (!file) {
      setSelectedFile(null);
      return;
    }
    if (!allowedImageTypes.includes(file.type)) {
      setSelectedFile(null);
      setError("Dieses Dateiformat wird nicht unterstützt. Erlaubt sind PNG, JPG, JPEG und WEBP.");
      return;
    }
    if (file.size > maxImageBytes) {
      setSelectedFile(null);
      setError("Das ausgewählte Bild ist zu groß. Bitte verwende eine Datei mit höchstens 5 MB.");
      return;
    }
    if (pendingCrop) {
      URL.revokeObjectURL(pendingCrop.sourceUrl);
    }
    setSelectedFile(null);
    const sourceUrl = URL.createObjectURL(file);
    pendingCropUrlRef.current = sourceUrl;
    try {
      const image = await loadCropImage(sourceUrl);
      const naturalWidth = image.naturalWidth || image.width;
      const naturalHeight = image.naturalHeight || image.height;
      if (naturalWidth <= 0 || naturalHeight <= 0) throw new Error("Das Bild hat keine gültigen Abmessungen.");
      const initialZoom = Math.max(naturalWidth, naturalHeight) / Math.min(naturalWidth, naturalHeight);
      setPendingCrop({ file, sourceUrl, naturalWidth, naturalHeight, crop: { ...defaultCrop, zoom: initialZoom } });
    } catch (err) {
      URL.revokeObjectURL(sourceUrl);
      pendingCropUrlRef.current = null;
      setError(err instanceof Error ? err.message : "Das Bild konnte nicht geladen werden.");
    }
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
      setMessage("Ausschnitt wurde übernommen. Du kannst das Bild jetzt hochladen.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Der Bildausschnitt konnte nicht erstellt werden.");
    } finally {
      setIsCropping(false);
    }
  }

  async function handleUpload() {
    if (!selectedFile) {
      setError("Bitte wähle zuerst ein Bild aus.");
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
    setIsDeleting(true);
    setMessage(null);
    setError(null);
    try {
      const updated = await deleteCategoryImage(category.id);
      onCategoryUpdated(updated);
      setSelectedFile(null);
      setMessage("Eigenes Bild wurde entfernt.");
      setIsDeleteConfirmOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Das Bild konnte nicht gelöscht werden.");
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
        <small>PNG, JPG, JPEG oder WEBP bis 5 MB. Ohne eigenes Bild wird weiterhin das ausgewählte Icon verwendet.</small>
      </div>
      <div className="category-image-control__preview">
        <CategoryTile category={displayCategory} size="compact" />
      </div>
      <input
        aria-label={`Bilddatei für ${category.name} auswählen`}
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
          <button className="secondary-action" disabled={isBusy} onClick={() => setIsDeleteConfirmOpen(true)} type="button">
            Bild entfernen
          </button>
        ) : null}
      </div>
      {isUploading ? <p className="form-success" role="status">Bild wird hochgeladen …</p> : null}
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
      <AppDialog description="Anschließend wird wieder das Standardsymbol dieser Kategorie angezeigt." isOpen={isDeleteConfirmOpen} onClose={() => setIsDeleteConfirmOpen(false)} preventClose={isDeleting} title="Eigenes Bild entfernen?">
        <div className="stack-form"><button className="primary-action category-danger-action" onClick={() => void handleDelete()} type="button">Bild entfernen</button><button className="secondary-action" onClick={() => setIsDeleteConfirmOpen(false)} type="button">Abbrechen</button></div>
      </AppDialog>
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
    <AppDialog className="category-dialog" description={mode === "edit" ? category?.name : "Stammdaten und Darstellung festlegen"} isOpen onClose={onCancel} preventClose={isSaving} title={title}>
        <form className="stack-form" onSubmit={(event) => onSubmit(event)}>
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
    </AppDialog>
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
    <AppDialog className="category-confirm-dialog" description={category.name} isOpen onClose={onCancel} preventClose={isDeleting} title="Kategorie löschen?">
        <p className="category-confirm-dialog__copy">
          Die Kategorie „{category.name}“ wird dauerhaft gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.
        </p>
        <p className="category-confirm-dialog__copy">
          {subcategoryCount > 0
            ? `${subcategoryCount} Unterkategorie${subcategoryCount === 1 ? "" : "n"} sind betroffen. Falls noch abhängige Daten existieren, bleibt die Kategorie erhalten.`
            : "Es sind keine Unterkategorien betroffen."}
        </p>
        <div className="action-row action-row--wrap">
          <button className="primary-action category-danger-action" disabled={isDeleting} onClick={onConfirm} type="button">
            {isDeleting ? "Wird gelöscht …" : "Kategorie löschen"}
          </button>
          <button className="secondary-action" disabled={isDeleting} onClick={onCancel} type="button">
            Abbrechen
          </button>
        </div>
    </AppDialog>
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
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [statusTarget, setStatusTarget] = useState<{ category: Category; nextStatus: boolean } | null>(null);

  const categoryTree = useMemo(() => buildCategoryTree(categories), [categories]);
  const rootCategories = categoryTree;
  const filteredRootCategories = rootCategories.filter((category) => {
    const matchesStatus = statusFilter === "all" || (statusFilter === "active" ? category.is_active : !category.is_active);
    const query = search.trim().toLocaleLowerCase("de-DE");
    const matchesSearch = !query || category.name.toLocaleLowerCase("de-DE").includes(query)
      || category.children.some((child) => child.name.toLocaleLowerCase("de-DE").includes(query));
    return matchesStatus && matchesSearch;
  });

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
      setError("Der Kategoriename darf höchstens 50 Zeichen lang sein.");
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
    try {
      const updated = await updateCategory(category.id, { is_active: isActive });
      setCategories((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setMessage(isActive ? "Kategorie wurde wieder aktiviert." : "Kategorie wurde deaktiviert.");
      setStatusTarget(null);
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
      setMessage("Kategorie wurde gelöscht.");
      await loadCategories();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kategorie konnte nicht gelöscht werden.");
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
          className="category-action-button"
          disabled={index === 0 || isSorting}
          onClick={() => void moveCategory(siblings, index, -1, parentCategoryId)}
          type="button"
        >
          <ArrowUp aria-hidden="true" /><span className="sr-only">Nach oben</span>
        </button>
        <button
          aria-label={`Kategorie ${category.name} nach unten verschieben`}
          className="category-action-button"
          disabled={index === siblings.length - 1 || isSorting}
          onClick={() => void moveCategory(siblings, index, 1, parentCategoryId)}
          type="button"
        >
          <ArrowDown aria-hidden="true" /><span className="sr-only">Nach unten</span>
        </button>
        <button aria-label="Bearbeiten" className="category-action-button" onClick={() => startEdit(category)} type="button">
          <Pencil aria-hidden="true" /><span className="sr-only">Bearbeiten</span>
        </button>
        <button
          aria-label={category.is_active ? "Deaktivieren" : "Aktivieren"}
          className="category-action-button"
          onClick={() => setStatusTarget({ category, nextStatus: !category.is_active })}
          type="button"
        >
          <Power aria-hidden="true" /><span className="sr-only">{category.is_active ? "Deaktivieren" : "Aktivieren"}</span>
        </button>
        <button aria-label="Löschen" className="category-action-button category-action-button--danger" onClick={() => setDeleteTarget(category)} type="button">
          <Trash2 aria-hidden="true" /><span className="sr-only">Löschen</span>
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
      <PageHeader backLabel="Einstellungen" backTo="/settings" eyebrow="Verwaltung" title="Kategorien" action={<button className="page-action" onClick={startCreate} type="button"><Plus aria-hidden="true" /><span>Neu</span></button>} />

      <p className="section-intro">Ober- und Unterkategorien durchsuchen, sortieren und gestalten.</p>
      <div className="admin-toolbar">
        <label className="dialog-search"><Search aria-hidden="true" /><span className="sr-only">Kategorien suchen</span><input onChange={(event) => setSearch(event.target.value)} placeholder="Kategorien suchen" value={search} /></label>
        <label><span className="sr-only">Status filtern</span><select aria-label="Status filtern" onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)} value={statusFilter}><option value="all">Alle</option><option value="active">Aktiv</option><option value="inactive">Inaktiv</option></select></label>
      </div>

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
        {!isLoading && categories.length > 0 && filteredRootCategories.length === 0 ? <AppCard>Keine passenden Kategorien gefunden.</AppCard> : null}
        {filteredRootCategories.map((category) => {
          const index = rootCategories.findIndex((item) => item.id === category.id);
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
                <span className="category-accordion-item__chevron" aria-hidden="true">{isExpanded ? <ChevronDown /> : <ChevronRight />}</span>
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
      <AppDialog description={statusTarget?.nextStatus ? "Die Kategorie wird wieder für neue Buchungen angeboten." : "Die Kategorie verschwindet von der Startseite. Bestehende Buchungen bleiben erhalten."} isOpen={Boolean(statusTarget)} onClose={() => setStatusTarget(null)} title={statusTarget?.nextStatus ? "Kategorie aktivieren?" : "Kategorie deaktivieren?"}>
        {statusTarget ? <div className="stack-form"><button className={`primary-action${statusTarget.nextStatus ? "" : " category-danger-action"}`} onClick={() => void handleActiveChange(statusTarget.category, statusTarget.nextStatus)} type="button">Bestätigen</button><button className="secondary-action" onClick={() => setStatusTarget(null)} type="button">Abbrechen</button></div> : null}
      </AppDialog>
    </PageContainer>
  );
}
