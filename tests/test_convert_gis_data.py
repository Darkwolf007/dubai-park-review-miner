import importlib.util
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('convert_gis_data', ROOT / 'scripts' / 'convert_gis_data.py')
convert_gis_data = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(convert_gis_data)


class ConvertGisDataTests(unittest.TestCase):
    def test_resolve_park_center_uses_geometry_centroid(self):
        parks_fc = {
            'features': [
                {
                    'geometry': {'type': 'Point', 'coordinates': [55.2289, 25.1706]},
                    'properties': {'name': 'Other park'}
                },
                {
                    'geometry': {
                        'type': 'Polygon',
                        'coordinates': [[
                            [55.21593, 25.154201],
                            [55.216368, 25.153922],
                            [55.216497, 25.154093],
                            [55.216248, 25.154248],
                            [55.21593, 25.154201],
                        ]]
                    },
                    'properties': {'name': 'Al Safa 2 Park'}
                }
            ]
        }

        lng, lat = convert_gis_data.resolve_park_center(parks_fc, 55.2289, 25.1706)

        self.assertAlmostEqual(lng, 55.216195, places=3)
        self.assertAlmostEqual(lat, 25.154133, places=3)


if __name__ == '__main__':
    unittest.main()
