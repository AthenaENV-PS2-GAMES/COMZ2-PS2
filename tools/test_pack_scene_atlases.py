import math
import unittest

from tools.pack_scene_atlases import remap_uv, wrapped_triangle_cells
from tools.pack_scene_atlases import quantize_page
from PIL import Image


def signed_area(polygon):
    return sum(
        polygon[i][0] * polygon[(i + 1) % len(polygon)][1]
        - polygon[(i + 1) % len(polygon)][0] * polygon[i][1]
        for i in range(len(polygon))
    ) / 2


class WrappedTriangleTests(unittest.TestCase):
    def test_negative_repeated_uv_preserves_area_and_stays_in_cells(self):
        corners = [
            (-0.25, -0.25, 0, 0, 0, 0, 1, 0),
            (0.75, -0.25, 1, 0, 0, 0, 1, 0),
            (0.75, 0.75, 1, 1, 0, 0, 1, 0),
        ]
        cells = list(wrapped_triangle_cells(corners))
        self.assertEqual({(u, v) for u, v, _ in cells}, {
            (-1, -1), (-1, 0), (0, -1), (0, 0)
        })
        area = sum(abs(signed_area(polygon)) for _, _, polygon in cells)
        self.assertTrue(math.isclose(area, abs(signed_area(corners)), abs_tol=1e-9))
        for tile_u, tile_v, polygon in cells:
            for point in polygon:
                self.assertGreaterEqual(point[0], tile_u - 1e-9)
                self.assertLessEqual(point[0], tile_u + 1 + 1e-9)
                self.assertGreaterEqual(point[1], tile_v - 1e-9)
                self.assertLessEqual(point[1], tile_v + 1 + 1e-9)

    def test_integer_tile_edges_map_to_the_matching_gutter_edge(self):
        page_size = 256
        gutter = 2
        inner_size = 124
        expected_right = (gutter + inner_size) / page_size
        expected_bottom = 1 - gutter / page_size
        self.assertEqual(
            remap_uv(1, 1, 0, 0, 0, 0, page_size, gutter),
            (expected_right, expected_bottom),
        )
        self.assertEqual(
            remap_uv(0, 0, -1, -1, 0, 0, page_size, gutter),
            (expected_right, expected_bottom),
        )

    def test_page_quantization_preserves_alpha_mask_and_fits_t8(self):
        image = Image.new("RGBA", (16, 16))
        for y in range(16):
            for x in range(16):
                image.putpixel((x, y), (
                    x * 16,
                    y * 16,
                    (x * 16 + y * 16) % 256,
                    0 if x < 4 else (10 if x < 8 else 255),
                ))
        result, colors = quantize_page(image)
        self.assertLessEqual(colors, 256)
        self.assertEqual(result.getpixel((0, 0))[3], 0)
        self.assertEqual(result.getpixel((6, 0))[3], 0)
        self.assertEqual(result.getpixel((12, 0))[3], 255)


if __name__ == "__main__":
    unittest.main()
