// Reserveklaff for tilbakeslagsventilen i viftemotoren
// IKEA UNDERVERK HD UR01 60S (art.nr. 903.046.10, Whirlpool/Elica), originaldel merket "VNR0029514 >PP<"
// Originalen heter Elica VNR0029514A / Whirlpool C00861115 "Kontraspjeld Ø150".
//
// Parametrisk modell: mål den gamle klaffen (eller den hele av de to) og
// juster verdiene under. Alle mål i mm.
// Printes flatt med glatt side ned. Ribbene vender opp.
//
// Koordinater: hengselaksen ligger langs X, halvsirkelen i +Y, platen i Z=0..plate_t.

/* [Hovedmål] */
// Diameter på klaffen = lengden på den rette kanten, UTEN tappene (originalen: ca 137)
diameter = 137;
// Tykkelse på den flate platen
plate_t = 1.2;

/* [Hengsel] */
// Diameter på hengselstangen langs den rette kanten
rod_d = 3.5;
// printed = tappene printes i ett med klaffen, wire = hull tvers gjennom stangen for en ståltråd som blir tapper
pin_style = "printed"; // [printed, wire]
// Diameter på tappene (printed). Finn den med målesettet (maalesett.stl)
pin_d = 2;
// Hvor langt hver tapp stikker ut forbi enden av stangen, inkludert kragen (originalen: ca 5)
pin_len = 5;
// Krage (litt tykkere ring) innerst på hver tapp, som på originalen. 0 = ingen krage
pin_collar_d = 4;
// Bredde på kragen langs tappen
pin_collar_w = 1.2;
// Hulldiameter for ståltråden (wire). 2 mm tråd -> ca 2.2
wire_hole_d = 2.2;
// Diameter på hengselstangen når pin_style = wire (må være tykkere enn rod_d for å få vegg rundt tråden)
wire_rod_d = 5;
// Hvor mye av undersiden på stang og tapper som flates av, så de står stødig på platen
flat_bottom = 0.4;

/* [Ribber] */
// Høyde på ribbene over platen (0 = ingen ribber)
rib_h = 2;
// Bredde på ribbene
rib_w = 1.2;
// Avstand fra ytterkanten inn til den buede ribben
ring_inset = 12;
// Avstand fra hengselaksen til den rette ribben som går parallelt med hengselet
cross_rib_offset = 7;
// Retning på skråribbene, i grader fra hengselaksen (90 = rett ut fra midten)
rib_angles = [60, 120];

/* [Midtknast] */
// Den lille knasten midt på den rette kanten, som på originalen
center_tab = true;
// Bredde langs hengselet
center_tab_w = 8;
// Hvor langt den stikker ut forbi hengselstangen
center_tab_out = 2;

/* [Annet] */
// Speilvend delen (hvis klaffen du skal erstatte er speilvendt av den du måler på)
mirror_part = false;
$fn = 160;

R = diameter / 2;
rod = pin_style == "wire" ? wire_rod_d : rod_d;
axis_z = rod / 2 - flat_bottom;   // stangen hviler på byggeplata
eps = 0.01;

assert(plate_t > 0 && plate_t <= rod, "plate_t må være mellom 0 og stangdiameteren");
assert(pin_style != "wire" || axis_z - wire_hole_d / 2 >= 0.8,
       "wire_rod_d er for liten: for lite vegg under ståltråden");
assert(ring_inset + rib_w < R - cross_rib_offset, "ring_inset er for stor for denne diameteren");

module half_disc(r, h) {
    intersection() {
        cylinder(r = r, h = h);
        translate([-r - 1, 0, -1]) cube([2 * r + 2, r + 1, h + 2]);
    }
}

// Sylinder langs X på hengselaksen, fra x0 til x1
module along_axis(d, x0, x1) {
    translate([x0, 0, axis_z]) rotate([0, 90, 0]) cylinder(d = d, h = x1 - x0);
}

// Dråpeformet hull langs X med spissen opp (avkuttet), printes uten support.
// rotate([0, 90, 0]) gjør lokal -X til global +Z, så spissen legges mot lokal -X.
module teardrop_along_axis(d, x0, x1) {
    translate([x0, 0, axis_z]) rotate([0, 90, 0])
        linear_extrude(height = x1 - x0)
            intersection() {
                rotate(90) union() {
                    circle(d = d);
                    rotate(45) square(d / 2);
                }
                translate([-0.6 * d, -d]) square([1.1 * d, 2 * d]);
            }
}

module rib_segment(p0, p1) {
    hull() {
        translate([p0[0], p0[1], plate_t - eps]) cylinder(d = rib_w, h = rib_h + eps, $fn = 16);
        translate([p1[0], p1[1], plate_t - eps]) cylinder(d = rib_w, h = rib_h + eps, $fn = 16);
    }
}

module ribs() {
    r_out = R - ring_inset;
    // buet ribbe, kuttet ved den rette ribben
    intersection() {
        translate([0, 0, plate_t - eps]) difference() {
            cylinder(r = r_out, h = rib_h + eps);
            translate([0, 0, -1]) cylinder(r = r_out - rib_w, h = rib_h + 2);
        }
        translate([-R, cross_rib_offset, 0]) cube([2 * R, R, plate_t + rib_h + 1]);
    }
    // rett ribbe parallelt med hengselet
    x_end = sqrt(pow(r_out - rib_w / 2, 2) - pow(cross_rib_offset, 2));
    rib_segment([-x_end, cross_rib_offset], [x_end, cross_rib_offset]);
    // skråribber fra midten av den rette ribben ut til den buede
    for (a = rib_angles)
        rib_segment([0, cross_rib_offset],
                    [(r_out - rib_w / 2) * cos(a), (r_out - rib_w / 2) * sin(a)]);
}

module center_knob() {
    translate([-center_tab_w / 2, -rod / 2 - center_tab_out, 0])
        cube([center_tab_w, rod / 2 + center_tab_out, plate_t]);
}

module pin(side) {
    x0 = side > 0 ? R - eps : -R - pin_len;
    along_axis(pin_d, x0, x0 + pin_len + eps);
    if (pin_collar_d > 0) {
        xc = side > 0 ? R - eps : -R - pin_collar_w;
        along_axis(pin_collar_d, xc, xc + pin_collar_w + eps);
    }
}

module flap() {
    intersection() {
        difference() {
            union() {
                half_disc(R, plate_t);
                along_axis(rod, -R, R);
                if (pin_style == "printed") {
                    pin(-1);
                    pin(1);
                }
                if (rib_h > 0) ribs();
                if (center_tab) center_knob();
            }
            if (pin_style == "wire")
                teardrop_along_axis(wire_hole_d, -R - 1, R + 1);
        }
        // flat underside: alt under Z=0 kuttes bort
        translate([-R - pin_len - 1, -R, 0]) cube([2 * (R + pin_len + 1), 2 * R + 1, 50]);
    }
}

if (mirror_part) mirror([1, 0, 0]) flap();
else flap();
