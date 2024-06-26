import { describe, it } from 'mocha';
import { expect } from 'chai';
import { Spatial, computeMbr, computeUmmMbr } from '../../../app/util/spatial/mbr';
import { PointType, LineType, BoundingRectangleType, GPolygonType } from '../../../app/util/spatial/umm-spatial';

/**
 * Makes a Spatial object from a lat/lng string
 * @param points - latitude and longitude in the form 'lat lng'
 * @returns a Spatial object containing a 'points' entry
 */
function makePointsSpatial(points: string[]): Spatial {
  return { points };
}

/**
 * Makes lines
 * @param points - line string in the form 'lat lng lat lng ...'
 * @returns a Spatial object containing a 'lines' entry
 */
function makeLinesSpatial(points: string[]): Spatial {
  return { lines: points };
}

/**
 * Makes polygon
 * @param polygon - the polygons
 * @returns a Spatial object with a `polygons` entry
 */
function makePolygonsSpatial(polygons: string[][]): Spatial {
  return { polygons };
}

describe('Given a point', () => {
  const tests: [string, string[], number[]][] = [
    [
      'a simple point',
      ['10 35'],
      [34.99999999, 9.99999999, 35.00000001, 10.00000001],
    ],
    [
      'a point on the antimeridian',
      ['0, 180'],
      [179.99999999, -1e-8, -179.99999999, 1e-8],
    ],
    [
      'a point on a pole',
      ['90 0'],
      [-1e-8, 89.99999999, 1e-8, 89.99999999],
    ],
    [
      'more than one point',
      ['10 35', '20 40'],
      [34.99999999, 9.99999999, 40.00000001, 20.00000001],
    ],
  ];

  tests.forEach((test) => {
    describe(`when the point is ${test[0]}`, function () {
      it('returns a correct mbr', function () {
        expect(computeMbr(makePointsSpatial(test[1]))).to.eql(test[2]);
      });
    });
  });
});

describe('Given a line', () => {
  const tests: [string, string[], number[]][] = [
    [
      'a simple line',
      ['10 35 15 45 25 45'],
      [35, 10, 45, 25],
    ],
    [
      'a line across the antimeridian',
      ['-10, 170 10 -170'],
      [170, -10, -170, 10],
    ],
    [
      'a line near a pole',
      ['85 0 89 10'],
      [0, 85, 10, 89],
    ],
    [
      'more than one line',
      ['10 35 15 45', '20 40 25 30'],
      [30, 10, 45, 25],
    ],
    [
      'more than one line on either side of the antimeridian',
      ['10 170 15 175', '20 -170 25 -175'],
      [170, 10, -170, 25],
    ],
  ];

  tests.forEach((test) => {
    describe(`when the line is ${test[0]}`, function () {
      it('returns a correct mbr', function () {
        expect(computeMbr(makeLinesSpatial(test[1]))).to.eql(test[2]);
      });
    });
  });
});

describe('Given a polygon', () => {
  const tests: [string, string[][], number[]][] = [
    [
      'simple box',
      [['0 35 0 40 10 40 10 35 0 35']],
      [35, 0, 40, 10.00933429],
    ],
    [
      'box across the antimeridian',
      [['-10 175 -10 -175 10 -175 10 175 -10 175']],
      [175, -10.03742305, -175, 10.03742305],
    ],
    [
      'multi-polygon',
      [['0 35 0 40 10 40 10 35 0 35'], ['-10 50 -10 55 0 55 0 50 -10 50']],
      [35, -10.00933429, 55, 10.00933429],
    ],
    [
      'box over the north pole',
      [['80 0 80 100 80 -170 80 -20 80 0']],
      [-180, 80, 180, 90],
    ],
    [
      'box over the south pole',
      [['-80 0 -80 -100 -80 170 -80 20 -80 0']],
      [-180, -90, 180, -80],
    ],
  ];

  tests.forEach((test) => {
    describe(`when the polygon is a ${test[0]}`, function () {
      it('returns a correct mbr', function () {
        expect(computeMbr(makePolygonsSpatial(test[1]))).to.eql(test[2]);
      });
    });
  });
});

/**
 * Returns a UMM spatial point
 * @param lat - latitude of the point
 * @param lon - longitude of the point
 * @returns a UMM PointType object
 */
function ummPoint(lat: number, lon: number): PointType {
  return { Longitude: lon, Latitude: lat };
}

/**
 * Returns a list of UMM spatial points
 * @param numbers -  an array of numbers define Latitude and Longitude of points
 * @returns a list of UMM spatial points
 */
function ummPoints(numbers: number[]): PointType[] {
  const points: PointType[] = [];
  for (let i = 0; i < numbers.length; i += 2) {
    points.push(ummPoint(numbers[i], numbers[i + 1]));
  }
  return points;
}

/**
 * Returns a UMM spatial Line
 * @param numbers -  an array of numbers define Latitude and Longitude of points
 * @returns a UMM LineType object
 */
function ummLine(numbers: number[]): LineType {
  return { Points: ummPoints(numbers) };
}

/**
 * Returns a UMM spatial BoundingRectangle
 * @param w -  WestBoundingCoordinate of BoundingRectangle
 * @param s -  SouthBoundingCoordinate of BoundingRectangle
 * @param e -  EastBoundingCoordinate of BoundingRectangle
 * @param n -  NorthBoundingCoordinate of BoundingRectangle
 * @returns a UMM BoundingRectangle object
 */
function ummBoundingRectangle(w: number, s: number, e: number, n: number): BoundingRectangleType {
  return {
    WestBoundingCoordinate: w,
    SouthBoundingCoordinate: s,
    EastBoundingCoordinate: e,
    NorthBoundingCoordinate: n,
  };
}

/**
 * Returns a UMM spatial GPolygon
 * @param numbers -  an array of numbers define Latitude and Longitude of points
 * @returns a UMM GPolygonType object
 */
function ummGPolygon(numbers: number[]): GPolygonType {
  return { Boundary: { Points: ummPoints(numbers) } };
}

describe('Given a UMM spatial point', () => {
  const tests: [string, PointType[], number[]][] = [
    [
      'a simple point',
      ummPoints([10, 35]),
      [34.99999999, 9.99999999, 35.00000001, 10.00000001],
    ],
    [
      'a point on the antimeridian',
      ummPoints([0, 180]),
      [179.99999999, -1e-8, -179.99999999, 1e-8],
    ],
    [
      'a point on a pole',
      ummPoints([90, 0]),
      [-1e-8, 89.99999999, 1e-8, 89.99999999],
    ],
    [
      'more than one point',
      ummPoints([10, 35, 20, 40]),
      [34.99999999, 9.99999999, 40.00000001, 20.00000001],
    ],
  ];

  tests.forEach((test) => {
    describe(`when the point is ${test[0]}`, function () {
      it('returns a correct mbr', function () {
        expect(computeUmmMbr({ Points: test[1] })).to.eql(test[2]);
      });
    });
  });
});

describe('Given a UMM spatial line', () => {
  const tests: [string, LineType[], number[]][] = [
    [
      'a simple line',
      [ummLine([10, 35, 15, 45, 25, 45])],
      [35, 10, 45, 25],
    ],
    [
      'a line across the antimeridian',
      [ummLine([-10, 170, 10, -170])],
      [170, -10, -170, 10],
    ],
    [
      'a line near a pole',
      [ummLine([85, 0, 89, 10])],
      [0, 85, 10, 89],
    ],
    [
      'more than one line',
      [ummLine([10, 35, 15, 45]), ummLine([20, 40, 25, 30])],
      [30, 10, 45, 25],
    ],
    [
      'more than one line on either side of the antimeridian',
      [ummLine([10, 170, 15, 175]), ummLine([20, -170, 25, -175])],
      [170, 10, -170, 25],
    ],
  ];

  tests.forEach((test) => {
    describe(`when the line is ${test[0]}`, function () {
      it('returns a correct mbr', function () {
        expect(computeUmmMbr({ Lines: test[1] })).to.eql(test[2]);
      });
    });
  });
});

describe('Given a UMM spatial bounding rectangle', () => {
  const tests: [string, BoundingRectangleType[], number[]][] = [
    [
      'simple rectangle',
      [ummBoundingRectangle(35, 0, 40, 10)],
      [35, 0, 40, 10],
    ],
    [
      'rectangle across the antimeridian',
      [ummBoundingRectangle(175, -10, -175, 10)],
      [175, -10, -175, 10],
    ],
    [
      'multi-rectangle',
      [ummBoundingRectangle(35, 0, 40, 10), ummBoundingRectangle(50, -10, 55, 0)],
      [35, -10, 55, 10],
    ],
  ];

  tests.forEach((test) => {
    describe(`when the bounding rectangle is a ${test[0]}`, function () {
      it('returns a correct mbr', function () {
        expect(computeUmmMbr({ BoundingRectangles: test[1] })).to.eql(test[2]);
      });
    });
  });
});

describe('Given a UMM spatial polygon', () => {
  const tests: [string, GPolygonType[], number[]][] = [
    [
      'simple box',
      [ummGPolygon([0, 35, 0, 40, 10, 40, 10, 35])],
      [35, 0, 40, 10],
    ],
    [
      'box across the antimeridian',
      [ummGPolygon([-10, 175, -10, -175, 10, -175, 10, 175])],
      [175, -10.03742305, -175, 10],
    ],
    [
      'multi-polygon',
      [ummGPolygon([0, 35, 0, 40, 10, 40, 10, 35]), ummGPolygon([-10, 50, -10, 55, 0, 55, 0, 50])],
      [35, -10.00933429, 55, 10],
    ],
    [
      'box over the north pole',
      [ummGPolygon([80, 0, 80, 100, 80, -170, 80, -20])],
      [-180, 80, 180, 90],
    ],
    [
      'box over the south pole',
      [ummGPolygon([-80, 0, -80, -100, -80, 170, -80, 20])],
      [-180, -90, 180, -80],
    ],
  ];

  tests.forEach((test) => {
    describe(`when the polygon is a ${test[0]}`, function () {
      it('returns a correct mbr', function () {
        expect(computeUmmMbr({ GPolygons: test[1] })).to.eql(test[2]);
      });
    });
  });
});
