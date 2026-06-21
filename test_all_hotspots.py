# test_all_hotspots.py 
import requests
import time

API_URL = "http://127.0.0.1:8000/api/v1/predict"

# Dataset of true hotspots 
hotspot_data = [
  { "hex_id": "8960145b553ffff", "center_lat": 12.9764090874, "center_lon": 77.5759204607, "peak_hour": 3, "peak_day": "Saturday", "primary_junction": "BTP040 - Elite Junction", "impact_score": 100.0 },
  { "hex_id": "8960145b59bffff", "center_lat": 12.9646511644, "center_lon": 77.5763250836, "peak_hour": 19, "peak_day": "Sunday", "primary_junction": "BTP082 - KR Market Junction", "impact_score": 84.3346774194 },
  { "hex_id": "8960145b427ffff", "center_lat": 12.9774678306, "center_lon": 77.5789467132, "peak_hour": 19, "peak_day": "Sunday", "primary_junction": "BTP044 - Sagar Theatre Junction", "impact_score": 72.0766129032 },
  { "hex_id": "89618920923ffff", "center_lat": 12.9332236475, "center_lon": 77.6907799306, "peak_hour": 22, "peak_day": "Wednesday", "primary_junction": "No Junction", "impact_score": 45.7129256272 },
  { "hex_id": "8961892e9abffff", "center_lat": 12.9816459673, "center_lon": 77.6079040749, "peak_hour": 5, "peak_day": "Sunday", "primary_junction": "BTP051 - Safina Plaza Junction", "impact_score": 54.1666666667 },
  { "hex_id": "8960145b5cbffff", "center_lat": 12.974263655, "center_lon": 77.5782912781, "peak_hour": 3, "peak_day": "Sunday", "primary_junction": "BTP044 - Sagar Theatre Junction", "impact_score": 48.4963037634 },
  { "hex_id": "8961892e917ffff", "center_lat": 12.9827046115, "center_lon": 77.610931577, "peak_hour": 5, "peak_day": "Monday", "primary_junction": "No Junction", "impact_score": 32.5870855735 },
  { "hex_id": "8960145b3a7ffff", "center_lat": 13.000003176, "center_lon": 77.5498434668, "peak_hour": 2, "peak_day": "Friday", "primary_junction": "BTP027 - Modi Bridge Junction", "impact_score": 34.2237903226 },
  { "hex_id": "8961892e9bbffff", "center_lat": 12.9794999467, "center_lon": 77.6102755624, "peak_hour": 5, "peak_day": "Sunday", "primary_junction": "BTP051 - Safina Plaza Junction", "impact_score": 33.9213709677 },
  { "hex_id": "8960145a26bffff", "center_lat": 12.9743737905, "center_lon": 77.5446042585, "peak_hour": 3, "peak_day": "Tuesday", "primary_junction": "BTP020 - Hosahalli Metro Station", "impact_score": 28.8474462366 },
  { "hex_id": "8961892e2bbffff", "center_lat": 13.0091403585, "center_lon": 77.6950942554, "peak_hour": 19, "peak_day": "Sunday", "primary_junction": "No Junction", "impact_score": 26.1508736559 },
  { "hex_id": "8961892e937ffff", "center_lat": 12.9827332109, "center_lon": 77.6025053069, "peak_hour": 4, "peak_day": "Monday", "primary_junction": "BTP211 - Central Street Junction", "impact_score": 24.0255376344 },
  { "hex_id": "8960145b543ffff", "center_lat": 12.978554434, "center_lon": 77.5735496736, "peak_hour": 3, "peak_day": "Sunday", "primary_junction": "BTP057 - Anand Rao Junction", "impact_score": 22.6394489247 },
  { "hex_id": "896016964b7ffff", "center_lat": 13.0725595526, "center_lon": 77.5871631451, "peak_hour": 6, "peak_day": "Monday", "primary_junction": "No Junction", "impact_score": 18.0961581541 },
  { "hex_id": "89618925b7bffff", "center_lat": 12.9646225544, "center_lon": 77.5847483822, "peak_hour": 5, "peak_day": "Tuesday", "primary_junction": "BTP080 - NR Road, SP Road Junction", "impact_score": 20.4637096774 },
  { "hex_id": "8960145b30fffff", "center_lat": 13.0106736831, "center_lon": 77.5548341487, "peak_hour": 4, "peak_day": "Monday", "primary_junction": "No Junction", "impact_score": 16.612063172 },
  { "hex_id": "89601690193ffff", "center_lat": 13.185608135, "center_lon": 77.6806417617, "peak_hour": 23, "peak_day": "Friday", "primary_junction": "No Junction", "impact_score": 16.3040434588 },
  { "hex_id": "8960145b307ffff", "center_lat": 13.0074699256, "center_lon": 77.5541790716, "peak_hour": 4, "peak_day": "Sunday", "primary_junction": "BTP001 - 10th Cross, Dr. Rajkumar Road", "impact_score": 19.3632392473 },
  { "hex_id": "8960145a24fffff", "center_lat": 12.9732878266, "center_lon": 77.5499995678, "peak_hour": 6, "peak_day": "Monday", "primary_junction": "BTP070 - Cholurpalya Junction, Magadi Road", "impact_score": 19.279233871 },
  { "hex_id": "8960145b2a7ffff", "center_lat": 13.0074179277, "center_lon": 77.5710246118, "peak_hour": 2, "peak_day": "Sunday", "primary_junction": "No Junction", "impact_score": 15.9540210573 },
  { "hex_id": "8960145b5c7ffff", "center_lat": 12.9700008334, "center_lon": 77.5746097211, "peak_hour": 2, "peak_day": "Sunday", "primary_junction": "BTP043 - Upparpet Junction", "impact_score": 18.2711693548 },
  { "hex_id": "8960145b55bffff", "center_lat": 12.9796132235, "center_lon": 77.5765758583, "peak_hour": 19, "peak_day": "Sunday", "primary_junction": "BTP058 - Subbanna Junction", "impact_score": 20.1008064516 },
  { "hex_id": "8960145b377ffff", "center_lat": 13.0128180118, "center_lon": 77.5524635139, "peak_hour": 4, "peak_day": "Saturday", "primary_junction": "No Junction", "impact_score": 13.6088709677 },
  { "hex_id": "8960145b4cbffff", "center_lat": 12.9816745189, "center_lon": 77.59947812, "peak_hour": 23, "peak_day": "Wednesday", "primary_junction": "BTP042 - Minsk Square Junction (CTO)", "impact_score": 15.0369623656 },
  { "hex_id": "8960145b16bffff", "center_lat": 12.9967994818, "center_lon": 77.5491885012, "peak_hour": 3, "peak_day": "Thursday", "primary_junction": "BTP027 - Modi Bridge Junction", "impact_score": 14.0456989247 },
  { "hex_id": "8961892e387ffff", "center_lat": 12.9995832469, "center_lon": 77.6762534357, "peak_hour": 19, "peak_day": "Thursday", "primary_junction": "No Junction", "impact_score": 13.5920698925 },
  { "hex_id": "8961892c9d7ffff", "center_lat": 13.0351440052, "center_lon": 77.590747703, "peak_hour": 22, "peak_day": "Wednesday", "primary_junction": "No Junction", "impact_score": 10.745687724 }
]

def run_tests():

    print("=" * 80)
    print("STARTING BATCH TEST OF ALL HOTSPOTS")
    print("=" * 80)

    total = len(hotspot_data)

    for i, data in enumerate(hotspot_data, 1):

        payload = {
            "latitude": data["center_lat"],
            "longitude": data["center_lon"],
            "hour": data["peak_hour"],
            "day_of_week": data["peak_day"],
            "junction_name": data["primary_junction"],
        }

        print(f"\n[{i}/{total}]")
        print(f"Junction : {data['primary_junction']}")
        print(f"Expected Historical Score : {data['impact_score']:.2f}")

        try:

            start = time.time()

            response = requests.post(
                API_URL,
                json=payload,
                timeout=10,
            )

            latency = (time.time() - start) * 1000

            response.raise_for_status()

            result = response.json()

            print(f"Predicted Score      : {result['impact_score']}")
            print(f"Priority             : {result['priority']}")
            print(f"Recommended Action   : {result['recommended_action']}")
            print(f"Hex ID               : {result['hex_id']}")
            print(f"Hotspot              : {result['is_hotspot']}")
            print(f"Latency              : {latency:.1f} ms")

            diff = abs(
                result["impact_score"]
                - data["impact_score"]
            )

            print(f"Difference           : {diff:.2f}")

        except Exception as e:

            print(f"ERROR : {e}")

        print("-" * 80)


if __name__ == "__main__":
    run_tests()
