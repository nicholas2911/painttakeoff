# Test corpus — candidate plan sets (pending approval)

Found 2026-10-24. Each link was checked with a HEAD request only (returns a PDF);
nothing has been downloaded. Tags come from titles/snippets, not from opening
the files — "area" (prints room areas = automatic ground truth) and
vector/raster are likely, not confirmed. Files go in `sample-plans/corpus/`,
which git ignores (the drawings belong to their architects; used locally for
testing only).

Total ≈ 556 MB (49 known sizes + #10 unknown).
Mix: 23 residential / 27 commercial-institutional · 32 imperial / 18 metric ·
5 scanned · 18 with room areas · 5 finish schedules · 2 over 50 MB.

| # | file | MB | source | tags | URL |
|---|---|---|---|---|---|
| 1 | habitat-plan-1101.pdf | 0.2 | NC State / Habitat | res, imperial, area | https://outreach.design.ncsu.edu/ah+sc/wp-content/uploads/2013/06/Habitat1101.pdf |
| 2 | bsc-greensburg-ks-house.pdf | 6.1 | Building Science Corp | res, imperial | https://buildingscience.com/sites/default/files/migrate/pdf/Greensburg_KS_House_Plan_Example_wm.pdf |
| 3 | bsc-westford-ma-house.pdf | 5.2 | Building Science Corp | res, imperial | https://buildingscience.com/sites/default/files/migrate/pdf/Westford_MA_House_Plan_Example_wm.pdf |
| 4 | bsc-juneau-ak-house.pdf | 2.9 | Building Science Corp | res, imperial | https://buildingscience.com/sites/default/files/migrate/pdf/Juneau_AK_House_Plan_Example_wm.pdf |
| 5 | elcentro-adu-plan-a.pdf | 12.5 | City of El Centro CA | res, imperial, area | https://www.cityofelcentro.org/DocumentCenter/View/1280 |
| 6 | elcentro-adu-plan-d.pdf | 14.2 | City of El Centro CA | res, imperial, area | https://www.cityofelcentro.org/DocumentCenter/View/1277 |
| 7 | houston-habitat-mep-rfq.pdf | 1.6 | Houston Habitat | res, imperial | https://www.houstonhabitat.org/wp-content/uploads/sites/2/2024/12/Request-for-Proposal-MEP-1.pdf |
| 8 | rochester-ha-lake-tower-hall.pdf | 6.7 | Rochester Housing Authority | res, imperial, repaint scope | https://www.rochesterhousing.org/uploads/procurements/addendum/Lake%20Tower%2010th%20Floor%20Hallway%20Renovations.pdf |
| 9 | kcha-sandpiper-office-reno.pdf | 34.1 | King County HA | comm, imperial | https://www.kcha.org/Portals/0/PDF/Business/RequestFiles/029c68ff-f6bd-4e5c-bc94-6b8acc88970d.pdf |
| 10 | gvsu-housing-a110.pdf | ? | Grand Valley State Univ | inst, imperial | https://www.gvsu.edu/purchasing/bid/documents/B2D19675-9822-7D4E-185A1F8757E4A8BE/Housing%202016%20First%20Floor%20Layout%20A110_140752.pdf |
| 11 | tamug-ecrb-floor-plans.pdf | 1.8 | Texas A&M Galveston | inst, imperial | https://www.tamug.edu/adminaux/images/ECRB/Floor%20Level%20Drawings.pdf |
| 12 | east-providence-cc-drawings.pdf | 80.1 | East Providence RI | comm, imperial, big file | https://eastprovidenceri.gov/sites/default/files/field/files-docs/rfp/epcc_-_attachment_c_-_drawings_1.pdf |
| 13 | nebraska-sidney-rest-area.pdf | 17.1 | Nebraska DOT | comm, imperial | https://dot.nebraska.gov/media/snofxyzo/51276a-sidney-wb-rest-area-building.pdf |
| 14 | maine-connor-a601-schedules.pdf | 0.5 | Maine BGS | inst, imperial, finish schedule | https://www.maine.gov/dafs/bgs/sites/maine.gov.dafs.bgs/files/inline-files/3403%20Addendum%202%20Rebid%20Connor%202025-06-26%2010377.028_2.pdf |
| 15 | uky-nutter-finish-sched.pdf | 1.2 | Univ of Kentucky | inst, imperial, finish schedule | https://purchasing.uky.edu/sites/default/files/2023-03/cck-2696-23add2.pdf |
| 16 | visions-ti-addendum2.pdf | 4.3 | Visions in Education CA | comm, imperial, finish schedule | https://www.viedu.org/wp-content/uploads/2024/05/Visions-In-Education-TI-24-01-Addendum-No.-2-5-15-24-compressed.pdf |
| 17 | scf-dac-finish-plans.pdf | 2.1 | Southcentral Foundation AK | inst, imperial, area, finish schedule | https://www.southcentralfoundation.com/wp-content/uploads/2024/03/Exhibit-E-DAC-Finish-Floor-Plans-Reflected-Ceiling-Plan-Interior-Elevations.pdf |
| 18 | clute-city-hall.pdf | 0.4 | City of Clute TX | comm, imperial, area | https://clutetexas.gov/new/wp-content/uploads/2026/04/108-E-Main-St-Clute-TX-77531.pdf |
| 19 | springvale-town-hall.pdf | 0.8 | Town of Springvale WI | comm, imperial, area | https://tn.springvale.wi.gov/files/townHallCommittee/floorPlan-6-11.pdf |
| 20 | canada-ez899-drawings.pdf | 110.0 | CanadaBuys (PSPC) | comm, metric, big file | https://canadabuys.canada.ca/documents/pub/att/2017/08/16/708fa18a61576d98ecc36b88123b2c8f/ez899-180045_drawings.pdf |
| 21 | amg-shields-brawley-add2.pdf | 34.7 | AMG / SIM-PBK (CA school) | inst, imperial | https://amgassociatesinc.com/wp-content/uploads/2023/05/3594-Addendum-2.pdf |
| 22 | mchenry-reno-bp2-add21.pdf | 11.8 | McHenry County College | inst, imperial | https://www.mchenry.edu/bid/bids/2025/2024.11.01---MCC-2024-Reno-BP2---ADDENDUM-21.pdf |
| 23 | shutesbury-library-sd.pdf | 4.0 | Town of Shutesbury MA | inst, imperial | https://www.shutesbury.org/sites/default/files/%3Ca%20href%3D%22/taxonomy/term/136%22%20hreflang%3D%22en%22%3ELibrary%20Building%20Committee%3C/a%3E/SPL_SD_redesign%207_28_2023.pdf |
| 24 | dutch-john-remodel.pdf | 13.3 | Utah Public Notice | comm, imperial | https://www.utah.gov/pmn/files/1410267.pdf |
| 25 | suny-oneonta-alumni-plans.pdf | 1.0 | SUNY Oneonta | inst, imperial | https://suny.oneonta.edu/sites/default/files/2021%20Floor%20Plans%20Alumni.pdf |
| 26 | missouri-oa-o2521-plans.pdf | 3.4 | Missouri Office of Administration | comm, imperial | https://oa.mo.gov/sites/default/files/bid-opportunities/O2521-01%20Add%20%232%20Plan%20%26%20Specs.pdf |
| 27 | alaska-jsob-reno.pdf | 1.2 | Alaska Dept of Administration | comm, imperial | https://aws.state.ak.us/OnlinePublicNotices/Notices/Attachment.aspx?id=108950 |
| 28 | kirkwood-east-hall-add2.pdf | 6.8 | Kirkwood CC | inst, imperial | https://www.kirkwood.edu/_files/pdf/about-us/faculty-leadership/kirkwood-east-hall-addendum-2_access.pdf |
| 29 | sears-modern-homes-1940.pdf | 35.9 | Internet Archive | res, imperial, scanned | https://archive.org/download/SearsRoebuckCoTheBookofModernHomes19400001/SearsRoebuckCoTheBookofModernHomes19400001.pdf |
| 30 | cmhc-west-coast-1950.pdf | 5.9 | Internet Archive / CMHC | res, imperial, scanned, area | https://archive.org/download/ca-1-mh-50w-21/CA1%20MH%2050w21.pdf |
| 31 | cmhc-small-house-1965.pdf | 12.2 | Internet Archive / CMHC | res, imperial, scanned, area | https://archive.org/download/ca-1-mh-65-s-53-w/CA1%20MH%2065S53-W.pdf |
| 32 | wooden-brick-buildings-1875.pdf | 9.8 | Internet Archive | res, imperial, scanned | https://archive.org/download/buildings.plates.1875/buildings.plates.1875.pdf |
| 33 | liberty-homes-1934.pdf | 8.4 | Internet Archive | res, imperial, scanned | https://archive.org/download/libertyhomes.1934/libertyhomes.1934.pdf |
| 34 | haringey-marlborough-rd.pdf | 0.2 | Haringey Council UK | res, metric 1:50, area | https://publicregister.haringey.gov.uk/sfc/servlet.shepherd/document/download/069Tu00000BL9i4IAD |
| 35 | uk-brockworth-house.pdf | 0.5 | gov.uk | res, metric, area | https://assets.publishing.service.gov.uk/media/695520db295a95414df21a66/4455.PL.06B_Proposed_House_Plans.pdf |
| 36 | uk-villa-floor-plans.pdf | 0.2 | gov.uk | res, metric | https://assets.publishing.service.gov.uk/media/682f334cb33f68eaba9539c4/23110__D__1350B_The_Villa_Floor_Plans_A3_Size_30_April_2025-CH.pdf |
| 37 | uk-rowan-floor-plans.pdf | 0.2 | gov.uk | res, metric | https://assets.publishing.service.gov.uk/media/682f09eec054883884bff40e/23110__D__1210B_The_Rowan_Floor_Plans_A3_Size_30_April_2025-CH.pdf |
| 38 | dlr-sussex-st-floors-5-6.pdf | 1.1 | Dún Laoghaire-Rathdown, IE | res, metric 1:100 | https://dlrcoco.citizenspace.com/housing/proposed-housing-development-at-sussex-street-ebla/supporting_documents/06-1901-dlr-xx-05-dr-a-1000-proposed-fifth-and-sixth-floor-planspdf |
| 39 | pleanala-house-type-9b.pdf | 0.2 | An Bord Pleanála IE | res, metric, area | https://www.pleanala.ie/publicaccess/EIAR-NIS/308396/O'Mahony%20Pike/Drawings/1217A-OMP-H9-00-DR-A-1001_House%20Type%209B%20Floor%20Plan.pdf |
| 40 | pleanala-strutec-apt-type-a.pdf | 0.5 | An Bord Pleanála IE | res, metric, area | https://www.pleanala.ie/publicaccess/EIAR-NIS/303813/3.%20Strutec%20Architects/Drawings/Apartment%20Types/1725-PL2-200%20Apartment%20Block%20Type%20A%20Floor%20Plans.pdf |
| 41 | pleanala-boherboy-type-h.pdf | 0.9 | An Bord Pleanála IE | res, metric 1:100, area | https://www.pleanala.ie/publicaccess/EIAR-NIS/313145/Boherboy%20SHD%20Planning%20Application/Architecture/2.FINAL/2.PART%20V/PV14-Part_V-House_Type_H-Floor_Plans.pdf |
| 42 | qld-social-housing-apartments.pdf | 2.2 | Queensland Govt AU | res, metric, area | https://www.chde.qld.gov.au/__data/assets/pdf_file/0028/19099/social-housing-design-indicative-floor-plans-apartment.pdf |
| 43 | victor-harbor-arm-tender.pdf | 7.8 | City of Victor Harbor SA | comm, metric 1:100 | https://www.victor.sa.gov.au/__data/assets/pdf_file/0033/1526964/ARM-Architectural-Pack_80-D-and-C-Tender-Issue-Part-1.pdf |
| 44 | nsw-gregory-hills-ps.pdf | 7.4 | School Infrastructure NSW | inst, metric | https://www.schoolinfrastructure.nsw.gov.au/content/dam/infrastructure/projects/g/new-primary-school-in-gregory-hills/2023/august/A2_Approved_Architectural_Plans_1of4.pdf |
| 45 | nsw-meadowbank-amended.pdf | 24.6 | School Infrastructure NSW | inst, metric | https://www.schoolinfrastructure.nsw.gov.au/content/dam/infrastructure/projects/m/meadowbank-education-precinct/august-updates-2020/sdd/A2_-_MEEPS_RRAI_submitted_29_April_2020_-_Amended_Plans.pdf |
| 46 | nz-mt-cook-school.pdf | 10.4 | NZ Dept of Conservation | inst, metric, door/window schedules | https://dxcprod.doc.govt.nz/contentassets/09b8db7107434e9c9bef2a2ef9ab967b/mt-cook-aotearoa-school-prelim-drawings.pdf |
| 47 | npdc-saris-consent.pdf | 41.1 | New Plymouth DC, NZ | res, metric | https://npdc.govt.nz/media/qjchybe0/luc22-48356-m-saris-appendix-1.pdf |
| 48 | nl-michaelschool-bg.pdf | 0.8 | TenderNed NL | inst, metric 1:100, area | https://www.tenderned.nl/papi/tenderned-rs-tns/v2/publicaties/12542/documenten/29039/content |
| 49 | nl-tender-school-set.pdf | 7.7 | TenderNed NL | inst, metric | https://www.tenderned.nl/papi/tenderned-rs-tns/v2/publicaties/309393/documenten/8577146/content |
| 50 | winnipeg-st-vital-lib-a902.pdf | 0.2 | City of Winnipeg | inst, metric, finish schedule | https://www.winnipeg.ca/finance/findata/matmgt/documents/2016/768-2016/768-2016_Drawing_A902-R1.pdf |
