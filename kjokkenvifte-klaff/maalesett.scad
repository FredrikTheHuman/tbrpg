// Målesett for hengseltappene - for deg uten skyvelære
//
// Øverst: kam med liggende tapper (printes på samme måte som tappene på klaffen).
//   Hold kammen på høykant og stikk tappene én og én inn i det ledige hullet i ringen
//   der klaffen satt. Den tykkeste som går lett inn uten å klemme, er riktig pin_d.
// Nederst: plate med hull. Stikk en hel tapp fra den gamle klaffen i hullene - det
//   minste hullet den går i, er tappens diameter.
// Tallene er diameter i mm. Printes flatt uten support.

sizes = [1.5, 1.75, 2, 2.25, 2.5, 2.75, 3];
spacing = 10;
pin_len = 6;
flat_bottom = 0.2;
bar_w = 7;
bar_t = 4;
hole_plate_t = 2;
label_h = 0.6;
$fn = 64;

n = len(sizes);
L = n * spacing;

module label(s, size = 2.8) {
    linear_extrude(label_h)
        text(str(s), size = size, font = "Liberation Sans:style=Bold", halign = "center", valign = "center");
}

// Kam med tapper mot +Y
module pin_comb() {
    cube([L, bar_w, bar_t]);
    for (i = [0 : n - 1]) {
        d = sizes[i];
        x = spacing / 2 + i * spacing;
        intersection() {
            translate([x, bar_w - 0.01, d / 2 - flat_bottom]) rotate([-90, 0, 0])
                cylinder(d = d, h = pin_len + 0.01);
            translate([x - d, bar_w - 1, 0]) cube([2 * d, pin_len + 2, d]);
        }
        translate([x, bar_w / 2, bar_t - 0.01]) label(sizes[i]);
    }
}

// Plate med hull, under kammen
module hole_plate() {
    difference() {
        cube([L, 14, hole_plate_t]);
        for (i = [0 : n - 1])
            translate([spacing / 2 + i * spacing, 9, -1]) cylinder(d = sizes[i], h = hole_plate_t + 2);
    }
    for (i = [0 : n - 1])
        translate([spacing / 2 + i * spacing, 3.2, hole_plate_t - 0.01]) label(sizes[i], 2.4);
}

translate([0, 0, 0]) hole_plate();
translate([0, 18, 0]) pin_comb();
