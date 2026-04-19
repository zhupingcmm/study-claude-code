"""Unit tests for minicc_pkg.utils."""

import unittest

from minicc_pkg.utils import slugify, clamp, flatten


class TestSlugify(unittest.TestCase):
    """Tests for the slugify function."""

    def test_basic_string(self) -> None:
        self.assertEqual(slugify("Hello, World!"), "hello-world")

    def test_extra_whitespace(self) -> None:
        self.assertEqual(slugify("  lots   of   spaces  "), "lots-of-spaces")

    def test_special_characters(self) -> None:
        self.assertEqual(slugify("Price: $100 & free!"), "price-100-free")

    def test_already_slug(self) -> None:
        self.assertEqual(slugify("already-a-slug"), "already-a-slug")

    def test_empty_string(self) -> None:
        self.assertEqual(slugify(""), "")

    def test_underscores_replaced(self) -> None:
        self.assertEqual(slugify("hello_world_test"), "hello-world-test")


class TestClamp(unittest.TestCase):
    """Tests for the clamp function."""

    def test_value_within_range(self) -> None:
        self.assertEqual(clamp(5, 0, 10), 5)

    def test_value_below_low(self) -> None:
        self.assertEqual(clamp(-5, 0, 10), 0)

    def test_value_above_high(self) -> None:
        self.assertEqual(clamp(15, 0, 10), 10)

    def test_value_equals_low(self) -> None:
        self.assertEqual(clamp(0, 0, 10), 0)

    def test_value_equals_high(self) -> None:
        self.assertEqual(clamp(10, 0, 10), 10)

    def test_float_values(self) -> None:
        self.assertAlmostEqual(clamp(3.14, 0.0, 2.0), 2.0)

    def test_low_greater_than_high_raises(self) -> None:
        with self.assertRaises(ValueError):
            clamp(5, 10, 0)


class TestFlatten(unittest.TestCase):
    """Tests for the flatten function."""

    def test_already_flat(self) -> None:
        self.assertEqual(flatten([1, 2, 3]), [1, 2, 3])

    def test_nested_one_level(self) -> None:
        self.assertEqual(flatten([1, [2, 3], 4]), [1, 2, 3, 4])

    def test_deeply_nested(self) -> None:
        self.assertEqual(flatten([1, [2, [3, [4]]]]), [1, 2, 3, 4])

    def test_empty_list(self) -> None:
        self.assertEqual(flatten([]), [])

    def test_nested_empty_lists(self) -> None:
        self.assertEqual(flatten([[], [[]], []]), [])

    def test_mixed_types(self) -> None:
        self.assertEqual(flatten([1, ["a", [True, None]]]), [1, "a", True, None])


if __name__ == "__main__":
    unittest.main()
