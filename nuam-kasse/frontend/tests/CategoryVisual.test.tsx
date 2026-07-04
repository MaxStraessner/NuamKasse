import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { CategoryTile } from "../src/components/CategoryTile";

const rootCategory = {
  name: "Gesundheit",
  icon_key: "heart-pulse",
  color_key: "red",
  image_url: "/api/v1/categories/1/image?v=1",
};

const subcategory = {
  name: "Apotheke",
  icon_key: "pill",
  color_key: "red",
  image_url: null,
};

describe("CategoryTile custom images", () => {
  test("shows the standard icon when no image is present", () => {
    render(<CategoryTile category={subcategory} />);

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Kategorie Apotheke")).toHaveAttribute("data-has-custom-image", "false");
  });

  test("shows a custom image for the concrete category", () => {
    render(<CategoryTile category={rootCategory} />);

    const image = screen.getByRole("img", { name: "Bild der Kategorie Gesundheit" });
    expect(image).toHaveAttribute("src", rootCategory.image_url);
    expect(screen.getByLabelText("Kategorie Gesundheit")).toHaveAttribute("data-has-custom-image", "true");
  });

  test("falls back to the icon when the image cannot be loaded", () => {
    render(<CategoryTile category={rootCategory} />);

    fireEvent.error(screen.getByRole("img"));

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Kategorie Gesundheit")).toHaveAttribute("data-has-custom-image", "true");
  });

  test("does not inherit a root image for subcategories", () => {
    render(
      <>
        <CategoryTile category={rootCategory} />
        <CategoryTile category={subcategory} />
      </>,
    );

    expect(screen.getByRole("img", { name: "Bild der Kategorie Gesundheit" })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Bild der Kategorie Apotheke" })).not.toBeInTheDocument();
  });
});
