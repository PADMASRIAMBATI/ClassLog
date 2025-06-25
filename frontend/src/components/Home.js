import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './Home.css';

function Home() {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [stats, setStats] = useState({ userCount: 0, lectureCount: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Sample images - replace with your actual image URLs
  const images = [
    "https://cdn.pixabay.com/photo/2014/04/23/14/47/boy-330582_1280.jpg",
    "https://www.asiancollegeofteachers.com/admin_act/blog_images/Teacher_Training3.jpg",
    "https://i.ytimg.com/vi/C1gRikj0Csg/hq720.jpg?sqp=-oaymwE7CK4FEIIDSFryq4qpAy0IARUAAAAAGAElAADIQj0AgKJD8AEB-AH-CYAC0AWKAgwIABABGHIgTChAMA8=&rs=AOn4CLDNXepDMjbvzVp2efKLz1p4_xYZzQ",
    "https://static.vecteezy.com/system/resources/thumbnails/024/620/101/small_2x/group-of-children-studying-together-smiling-and-holding-books-generated-by-ai-free-photo.jpg",   
  ];
  
  // About section content
  const aboutContent = [
    {
      title: "Mission and Vision",
      description: "Teach For India is part of the global Teach For All network and aims to provide excellent education to all children, regardless of socioeconomic background. Their vision is to eliminate educational inequity in India.",
      image: "https://i.redd.it/wzej235bg5ad1.jpeg"
    },
    {
      title: "Teach For India",
      description: "Teach For India (TFI) is a non-profit improving education for underprivileged children through a two-year fellowship, where young professionals teach in low-income schools to bridge learning gaps.",
      image: "data:image/png;base64,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"
    },
    {
      title: "Flexible Learning",
      description: "Access our platform anytime, anywhere. Our courses are designed to fit your schedule and learning style.Learn at your own pace with courses available anytime, anywhere.",
      image: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAkGBxMTEhUTExMWFRUVFhcXGBcXGBUXGBUVFRcXFhUVFRcYHSggGBomHRUVITEhJSkrLi4uFx8zODMsNygtLisBCgoKDg0OGxAQGy0mICUtLS0tLSstLy0tLS0vLy8tLS0tLS8tLS0tLS0rLS0tLS0tLS0tLS0tLy0tLS0tLS0tLf/AABEIAJ8BPgMBIgACEQEDEQH/xAAcAAABBQEBAQAAAAAAAAAAAAAEAgMFBgcBAAj/xABJEAACAQMCAwQGBgYHBwQDAAABAgMABBESIQUxQQYTIlEyYXGBkaEHFCNCsfAzUnKSosEkQ1NigrLRFRZjc8LS4aOz4vE1RMP/xAAZAQADAQEBAAAAAAAAAAAAAAABAgMEAAX/xAAsEQACAgIBAwEHBAMAAAAAAAAAAQIRAyExBBJBURMiYXGB4fAUkaHBMrHR/9oADAMBAAIRAxEAPwDMLWzJGeVPzeDYHJrs97qOwwOlOW0QPOsu/I6Q3EjHei4JnXYdaNikjAGcGlK3eNhQB66VjRBO5zz3J86JsuFKedETWoQ7nfzpYiJ3XNI5aDY63C413O9Kj4Ur8hypMMDE4JqTRe6XbrQVlYqwi1sURcbe2umxQikW8TOvPnRNpYNnc0CgBJaxrS1tcjwUTf8ADhnr7qKsFEfTNCXICKl7xeYpME0h6VK3D6jvyphpNPSkbElvYDLKx2xSbazlYk7DHmQPM7Z/ZNPw3OX5VLJINJOPMfDQP+s1bBBSb7uEmzLnnKMU1y2kAorJz8OxOWIVQAMkljgAAAnOcbUwnEkfZLq2c+Xfxqf/AFCufdTPam8aC1Z0cozSRID5am1HntyQ/OqlcpDJIiSW8T97N3avCe7YKSoDHTlWYFjzFacHSRzQc0+C1ZVCU3VR/PzZchZXGc905H6yguv7y5HzpuVmO3UVlMjNBM4ikcaHZQykqSFJAOx9VS9r20v02+tSMPKTEo+EoakfS75EjlXJo0E7Ab1J2cayDcVndp9IdxykhtpB/wAsxn/0mUfKp3h30jQD07R1/wCXKrfwug/zUj6aRT2kSzNZqGxyrs1qKFte0tlPuHkjPlJETj3xF6mLZ7dvRnib1awh/dfSflSuE14HUovyR0cRHI123lIOCKlzw9xvpYjzAJHxG1ACLxUHrkY9K7DlTcc7tR6pkUmJdJ5UEDkVaNj0qJWQU3KwPSlLCCOdDk7t2deUcqehTNCxw71IagBRo5oaljr0aVySSvQyCigWOmEV4rjlSJVPSg1mbODXAY47701NH1FPSRmkKPOiDtBJGxQ8hPlRdytJaQYFNYGmjLeJdl7q1z9YgdB+tjKH/GuV+dCR4xX1Ep6c6r/F+wthcZLQCNz9+L7M58yB4WPtBqziTTMRsuD60L6vZTlpYup261pb/RzJECIJw69Ffwn4jY/AVC3fBZoN5oiozjOxXPqYZFZ8jkvA2mQMtjld+dGWsGEwK9OyjrRNnOMbVnd0MlXI5wzhJLBmqUmsATy5Uu0uNqeM5p1PVFVQyiKm3ypuSYCiWhzvTFxGuKHcw2Bz3iruajZuI5O1OXUJcYqMClTjFNpiuWgwXBJpRlJ5Uq3tsjcUr6mV3pKQi+ImCwcnI5VKQwkJjr/8pP8AtWu2UxwNLoW/VLaTny8QAPuNOuXHpqV9oOCd8+Jdm/eFbenjqSerVfAw9VnjcK3TuvJRfpLmP1VFPWce/Qj5/wA4qpdix/S4SeSM0h9QjRnz/CK0ftV2eW7RAXddGtgVAcePSCW5KB4P1x159KvbdmXtFnn7xHRbeVQQGB1uNAzsVPpHkxrZ0+CWNK/4I5Orx5E0nTeqZTC5O55nc+01zFertWoqOPCVCk/eXUPZqZd/epriy0bfylZE2B0RxDDAMN41LAg7c2b2e3ekd9E3pRlD5xscfuPnPuYUO1Pwd3Me4fxLQd84qbtuKxt98D27fjUA1gCAySKQRkawYiRnBwW8Bwdtn6UxcWjp6aMo6EjY+xuR9xpfZxY3e0aDaSsviicj1oxU/FTmpOPtJcLsZmP7YWT/ANwE1k6MRuCQfMHH4USvEph/WMfadX40rwBWQ1qDtO334om/Z1ofk2n+GjV7RwEeNJE/ZZJB89FZDBx6Vf1T7sU8e0BPpKR7Dn8cVKXT/AosvxNktuN2bbfWFU/8RHT+LBX51KWqJIPspI5P+W6P8lOawlOKIebY9oNFxTo3JlPvBqLwIqszNzitivpAg+sEfjQl1zrMLHjtzF+juJVHkHbT+6Tj5VMW/ba6Hp91L/zIlz8Y9J+dI8Pow+0LgwryuBUDF2zjbaS2x64pCP4XVvxo6Lj9k/N5Yv249Q+MTMflS+zkju/RKpd5pDLk7Ui3Ecm0E0Urc9Kthz7EcBj7hXo5enWkaa5OTCZshaD3p+4myAOVKvUUJkVyHsFY+dDSbmlCfzpSTLXWC7NE1CurIPP+dRzz74pSzVtoz2SivXnAYEMAQeYIBB9oNBI9OrJQoNkFxbsHZzZKq0LHrGcD9w5X4AVWLjsDcwnMbLMvkPC/7rHHzrSVlpwNU5YosKZk7zGI6ZFKHyYEfjS/rpY+BGb9lWP4CtUbDcwD7Rmug45VD9Mr5Hc2Z3aWlzKDohbbGdXg5+WrGfdXP9174n9GoHrdf5Vo+qlBqdYYh72zPU7HXf8Awh/jP/bSz2DnY5LxD3sf+mtCBqH7X8RMFpKy+mRoTz1PsCPYMn/DReKCVi9zMmurwBioIOkkZHI4OMj1HFe+sMRUYls+rlUpGrAbisjSQ1eR/hzgHLDNGXXEk9ERgj1Ep8ht8qjIbkA4Io63sTIC+CEG2QMs7dEQHYnb/wCzgUFNx2LKCyL3io9sjaPNFruZ7aRYgVbQJEAZ3PNCHDc9wOWKguNy3CwEfX4rmJiFOl8y49IB1kUSBcjlkjlXvpHt3W61HeNkRY2HI6UTWD+qwZjlTuNQ6EE1mvY6d3FUY54ve27+e/uP215JH6DsoO5APhOP1l5H3infrGsaTFGWPhVlBQ5OwOEIU8x93pTFqSHXDaPEPF+rnbNXi47G3o8apb3Q5h4iqvnmDlCpzy6mrizyRh/k6KfxZ8zynp3jgdPCGIG3sAqU7MWsYuAlxG4bBZAw+8B1jZfHtuPWvI5pm/4b3ZPfQXEBJ5ka1HmcnSfX6Rp08SuGiMa3gkTbCyNggggjSZR4TkDGlqDVqh8WTtkpKmiw9pLHvoS7BI3j9DLqNSFgVJbkAwc7FjuoxgZqj29w6bozLnngkZ/aHUeo1aONXSko8vfTx4wYnDQhCFUCRZY2ZXOx5+ZqqtjJxy6ddum9DDFpUy3VZ4ZZ90V+/kI+tg+nEjetR3bfwYU+0qaPsOCJMjTd8tvCpCF5stmRhkIgiUlzjcnSMCoerbDwmSO3aC8hnSHvO+SeFFmCNo0Nr0tgoVC9QQVHmabJaXumeLjeyAn4JOsphWNpX0hx3IaUPGwBWRNIyUII3x7cHao90IJBBBBwQdiCNiCOhq/Nxhrm2NnZOYzCYhHrdIpJ4UV9Y15A1d4wfRqxjlyqB7WRFpVIPeukMSTyJ41adR4suNmIXQpbqVNSx5ZN9sl+fcrKKStFdIrhFFRqO6kYgZyig+WdTHHuT51Yp7izUiCaHeNI1LhRudCliShVgck89XsqspV4Dix96duvmVaO4deTMPYT+FFxcYmX7wPtA/lipj/d+3l3t7gZ/VbDH4YV/wCA1Xry2MbtG2NSMVODkZBwcUicZDTxTxq3x6olIu0LfeQH2Ej5HNGw9oYjzDL7gfwNViuAZ286544iKbNAguNg6nyZSMgjqCOoNalfNliT6RClv29I1fxZrMOC22uWGLozxp7iQD8q1C8YFmYdST8TmsGZ0aYKyKmzmuYY7U/LMp2pKqelRbHdgbNg4NdDLR1tArvh6a4tYKhGk1wrTLe0fv8Az7/wrgB/P5NLJrwat5nHY5KIQ0PGaJUUAiwaU74FIC0gHJ9lBhQShp0UOpp9TXNHJiq6K5XRSjIcBqldtb4MyR9ANZ9rej8F/wA1Wq/lAXBOA2xPkgBZz+6D7yKyrivEzLI8n6zE+wdB7hge6s+eVRr1GXINcS4O1IfLdaaWJmpUdswO5rOkisVQdwyyRm+0JCqNTY54yBj1bsKsTNga3wsSgAKBlSpwwjjB9InbU/TkMYJqK4ajAaldfECpGVyVzyIcY6Cn3bUwV23BAAwCBk7jY4HTkKlLDKT+BP20Fdba+Bjfb7jUlxdyq2yQyyJGo5DS2lnJ+87aASx3O3kKr9TXaCwhy9xFeRTB5GYoBIkg1knOh13A881C17uGKjGkZXPu2dFT9hwadbJ76KUxqjhSFZkY5YJkFTvuw2qAFaVd2cg4DAkUbyGWRXbQpbC+J9RAHLUqj31YzZ8jj2r1dfQheC9ruJklY2a4wMlHQS7fDUfjT8/aa3c6bzhiBurR6oX/AHSP50f9FMYjF5O7d2I00liD4MZJJHPby9VDdqbuedYrcXsF6JH8JVEWZGHLUF9EYPvxXGZ9jyuPbVeVa8X41+7GIYOFvvDd3Fox6OpZfeyfzNPt2UnkBaGW0vR/dZQ/8ODn/FRfbHszbQ2WqIDvrZ40mYHn3ozh+mcsh9/roWPsVBotc3RiubhNUaMhZS2xwGX0OY3JogjlXb3KT+qv78b5IPiHA5Iv01rPF61HeL8+X71J4NcLExxLrjKsrR97JbZ1DG7Dw53OxJqWgm4pbQyyidxHBKYZAz95hgQuQsgI0ZwMjzp277QS5IveHQynQr50GN9DcnLpkAHzwKJbvk9afyf5/sjLvhdoysym5hIGQHRZ4ycbASRHb2kVXo3KnKkg+YOD8RVqjm4U5yv1qzf9ZCJUHqz6dPf7BEv6C+tLkkbJN9jKf3vGT76HA0ciXNr5/wDfuV4sZFjEhJ1SHUx6RqEXUx54Gp9zUvxHgizSPIjSDW5OrSs0R1E48cJJUftLtSb20ubFkaSKa2OGVJIpAUOfEygZOQc5wX/ClcP7SRnJn1CUgqZUig8SEgjWqd2+R5iTpU5qXMTZgzQqpK4vyvz+yNs+z7tKgBjlTWuoxuraV1DUWXZhtnmKibybXI7/AK7s37xLfzqy8V43qLSJPG5DYVGhfVgqAZI3YEpzPhL7Y2ztVVxXRUuZD5JY6rHf1OU/YpmRB/eHy3/lTFG8IX7TPkCf5fzoy0iS5ND7GRlrpT+osj+8IwX+Jlq7DIWqv9G0OWnc9ERB7XbUf/aq3zpivLzy96jbi1GyPZQd+tdil0n1Uv6tk7Uw8Z5VK7C9hcs4BBpmcq2+SaakQ43oaSQCgBl9Wu15KVivSM52Oi4zQyinQaBw5I+BXIRtTDnJAp8GuRw6DTyGh1NPRmuOHhShSVpYFIx0VXt3cukLY5yARJjmAx1TMfUQqL/91l6zMCRV57bcV/pOjBKxrp2/WO7f9I91VGazdyWAxnpWXI02VimuABeMaWx66NlnMmBn4UNLwBgdRoiwsW1j1UjUeUM4tk5bW2FAz09hpVwQiM/LQrNnIA8IJycnYbUbHEAMsce3aoztRKv1O50eJjC6gKCc6lK9P2qSNOS0OoNR0YmeEzL/AFTkY5qCw8ua5HQ0OwwcHY+Rr0bFTlSQfMHH4UYnFZht3rEeTHWPg2RXtQ4POlySHZzs+LsOBcwwupGElOnWD1U5+VWiy7PcatVxbS6kGSBHKrrvuSFkGBmqOL/OzRRNy+4EO3rjK0TZXa6gESSJicAxTMu5O3pA/jT7M2THOXlV6NX/AGi0QcW4pbPM09qZROVMokh1KxVdII7rAGwA8tqZsu11tFcpN/s9ImVHBEbY1O2NDaCABjBB67+qhoe1VxGSq31wuk4xIqyjbbmTn5VIJ22nbaRrKceUsZRj8QBRIvDLzFfRtHf99frNpdw3egO6KYykeCzq2QrY25gYJx1qzWnamN7tbWGWPuzagRSlVOi5AJG7D9XAIPUY51WBxG1k/ScKQ/3raUZ9oCf60NNbcJYeL65a56OocfzNHRKWGD04Nfs149PkWfs/cq1lbwTHUeItda22J1nJ1ZG2dWPeac403/5Ij7sNvZr7XAyPjLVUXs9bMVMHFIsg5USh4mBzkEEnY5A5CjT2f4npfu5Y7hZJFmbRKjl5EOVY6sHoNs9BXUI4QUu7ur56835+Cos3GOCW7SCZkRktbeWKZSB6SRJJGT68Od/ZVZk7MWcax28pmE7xB3uBvBAzqSiyjkFOnHvG/k1d3fEo1vFmtX/pg8ZCNhDjSSmnI9HbBPlT1t21iTMkkUwujCIWAYLDJpUqjuh3yM8sGuphhDJFad/J/nx/govetpC5OkbhcnSCeeByBpIjJyQCQOZA5e3yrwFSXDLsDCa9O5yuMh9WMAnpy5+uqxSbpnr4McZzqToiqSaURXDU2TEmj+ED0j7BQBqR4cwC+01LJwPDk1v6OodNqzf2kzH3Rqqj5l6uCKCKqfZ8FLe2TH9UHPtlLS/g4+FWHvsDavHyP32bcbpbEzzBDypp5FO4pi41PzqPcupxjakQWyWeZGGNqjrnhozsaaFk53BxRAtX6mu4ClLyXZVpeK6teNemZD1cZ6STQ9w/TzrjhxDnf84p0fn87Uwh/O3+tOA4/P8A4H40aAPxk/n8mkX3EO6QuRnBAwPNiAKUn56/61yeMMCpwQRuPV8aDDHnZD2HbTvJCqxjSDgnJyfWBVjueKxpBJcFvBGjMfVpGcH11nfFeDfVGEkZOhnwQfu5BIx5janOKjvoHiYnS6jUASM4IKnbnuAcVleRxdSN6wxmk4DsCCde99Iv4iOu+5I867Co8qXwmVYYQobUcbnTp9wXJ+JNR19xTXIFC+LckjyG2/yrK6LTx8tcB8qg1xrAHlkH2nHyptJMDNGK224I9oI/Guin4M6yrG0219QeNEGcoMg4Lcxn29Khe3D6bR9EqxFmQLIWZQGDqw8SjYHSRmpwPjOkg53IPX3jlVX7e3ZSFCssduzSemwLggKchQI2w243wOXOqQ3NGmUozVp/z90UdbWaZtFzaOz7Hv4QAxB5MxH2co9e3tqK43wU27hdaSauWkjWPU6ZJU/GprjnFf6KkHfNcSyqpLjVjT3zsOfiyfCunAwB68VVY3eJ1YFo3Ugqd1YEciPKvTxXyYeqcF7q2/X+tciUUlgoGWJAA6knYACpS24dLDcRCaN4iG7zDqUysXjYjONsKaeHa+8POfWP+IkUn+dDTC3rSvJLIRtFJgAAKNYEOEQbL+kHLHnVtnn+95E8AslllCyZ0KryPjmUjQuwHrOnHvo5+OzfdhiWHpF3KFNOMjLEaicfe1Z67UH2fv44ZS8iswMciDQVBBkXRq8QIPhLbHqRRtjaWLuP6RLGpz4HRQeXomYNpAPLUV67gVVCS7e5uSbXgRxjg2lRPFjunRJNGrLwiTkHB3K6sqG9md6j4r2ReUjj1ajj4ZxVinRwLmeTulH1cQxxRyxSaUdkjjHgYnCjxZ6kZ2qq0RYO0GfX3PpBH/aRD8wM/OupdIDkxAHzRnQ/MmgxU52YxmU7agnhzjw7MS2cgqBpUFl3Gqlm1GNlcce+XaLtu0E0Xo3F3GeeC4kHq2bTtUlH2vuWGGmgmHXv7fpy3KLgdOtM8fgAtyz5LalCFjqI33w+BzCvlN+jbE4quwjEch89CfFtf/8AI0sZKatHdR02OE6pP6D/ABCFpZHdVhGoltETIFXzCpqyBTrcdZ00XAMwUfZEsEaJgCA2VXLjl4TttU1wa1+yRRHbOSiuwlV2di7uVx3YLY0BBjGNzUZ2mtkUKe5WF9bKVQuVZQqOGw4BB+0A5dKeiKkm+2iGvrt5XLyNqY4ycAZwABsAByFDmumuGgWQk1I20RYKo5tgD2tsPmajqsHYy37y+t1PISBz7IgZT/kqGZ6K4+TYbgqPAuwTCD2INI+QrkExHOl20Yxk0DdHBz0rxJNtmqaYT9ay2KdkmGcGoczjOR0pbXof3V1Cpsm1l8qGuL4UBNckLtUbKxO+aKTZXuZq6ivMKICUllr0rM9ATUOdyT5be+jJlwDQ4iwOXy/8UVyBnA35z/5/lTinH5x/pSAPz+T/ACpa/n87Uwo4G/P/AJwfxoiMbfn/AFoZV39f59QosUGFIqHbqb9HH7WPt5D+dR0UnhGad7esVmhJOzoeXmGOT6huKAs8sOR99efmvuPX6auxCbu7AG21RvBJ2muwi8tLE/sgc/joHvpHGNs5r30coWuZH6LHj99hj/Ia7FBSexeryOON0WqawkXlvXrQycjqHvNWJWrzafKtP6ZXcWeH+plfvqyJnibkXONtjk7/AJxVP+k3sjeXEUBghMioXJC7HxBcNhsZGx5edapYcMBIkcct1U/ialpGyKaMKdssuLjpemq/1Z8lWkQtCwvLBnYkaS7zQFcZ9HGx+fKowcUnXlNKB5a393WvrHidj3iMoxkggalDgHHPQfSx5VjPFPosul9Boph74m9ynI/iFXBW7M3PGJSMMwb9pI35ftqacgnHdTMdixjTAAA8TGQ4A2A+yHIVL8S7JTRfpbeWP16Sy/vrlfnUM3Cid1YEUU2gdqDeF8aSNAjWttMMk6pFfvN+mtXGw6bVNy2EFzErQpZQSEhiDdyBgBkFWjl8IztyNU6SxdelM6mHnT+0Jyw27TJrjN0ruAIIoSmpW7kuUcg41DUzDHkRzzTKWTkZGg5/4kQPsILZBqOWf1U4swqkZx8M7saJFuGzD+rY/sgt/lzUra3SiER3CTIUYFHihgV0UcsuyrITnP3vKq6pHSn0unHou49jMPwNU5EaD728gcNk3EkmTokeRMFSRs8ZViNs8npmG3d4wscbSMzscIrM2I1XfCjOPtDvTY4nN/aMfadX+bNce9bwlWZWUNkqdJ1MzEkaeQwVHuoU0H4lzRXi1KI3bCoAM5DBIY0XUgnGgnRzMZP4VWu0jnMasmhgrOybDSZHY4IAG+lU6UWvakAu6W4WV00d53sr4G2MpNrBAwNqjrzjskqlXWE5+8IYVcfsuqgiu2RhGSdsizSTXa4a5mhHgauf0bw6riR/1IGH+KRlQfIvVKNX36PrdhbTSLzaZE90SMx+cq/CsfUvTL4VtF3uJ2jFAy8dGggqT6+lM3F6WXDc+VLsbhO7KsMnFeaorybJLZGpd6uVdgdgciutGAGIoa1nIyCDT16EAuS+IO9LF8jc/lQYkXO9cngQ0UkUTHOz/wBJMyYC3Icf2d0N8eQlBzn2k+yr/wAK+kOB8C4RrdjjxE64ifVIo2HrYCvniezxTUVzJHsjsB5Z2+B2rc40Z1I+qIOLwTH7OVGCnfDDn0FSC78t/ZXyNNdFlAY5xyqRi4s0RU28kkWMZ0uyknqfCRU1oo0nwfU7R1zuBWI8I+kuZNINxK2cDEqRSDPrYMH+dW7h30pITpkQE5wSFmTf2FGH8VMk3wI6XJoUUODRGjpVZs+3ti2MyaM/rFR8N8/Kpe44sMfZ75HpYIwPYd80Ja5DBdz0ULiKvd388vKCLTbxHoxiLGZlHUayRn1eqjZAka86kLgoiYGAAMADoB0xVL47xgDIzWLJLuZ6WCPbHZF9oL7Oo+6meyvayCz7zvRIWcpsqjZQCQ2SRz1H4eupf6PuHR31xIZV1RwhTpPoszE41DqAFO1Xztl2fs5YPtok8IChwqh0BwBpOOXLbltV8UVHkh1F5NIjOBdr7S6OmKXD/qONLe4Hn7quPDrEem+Ntwv8z/pWb9gvoyjhmN1MRKqtm3U4IxzWZ8deoXpzO+MaBHdf0hFG2zZHmMf6mtDkuEYY9Py2TZaguMcUjtojJKwUDYAkDU2+FGepx7OpwBTt9eJChkkYKo8yBk9FGSBk1lHanjD3GZJVwgUqBl1Cq3NVk3hdthuNR5cuVPGNiylRB8S4jdXtyJp4gkUase+jkOmCInLaXQlGbkBsWY49EbKrhPba4eVYbW6k0RoRi6VZlYKdTyyzjLDqNgFHhA9YPC7eFXe5DOht0Drr9DvCw0K00QLscB2CCLfuznwhsv8ACVmfvpHYTxHDFUGqSQFiIiWgQXCoHySxUAacAEnw80ci4W/b99fdm1E+lRqe2fxM4AMmIGyyqM9SOXroi+u+D3Duk4jSRMB+9QxsjEZKmZNtsEEhsZB3rOOC6Vhn0xm30KxaUZlxgN9isUmh1ZyuvdidKjV4QQX+FyMlsXidbhgjMO/CqsUasg7z+kYQkyOFypOF8I1asqAl3vfovt3yYJXTHQFZlHt+98WqrcS+jS6X0RFMPUdDfuvt/FQplFtH9ZuVZGd+8XuZHiMzgt3jsx1EBmKqNOD4XblpzNcP7Y3anvpr1RC02krcwjbkzrEYwWbT6OcqMkeRrjih8U7LyRfpYZIvWynT+/6PwNRL8JPNWBFblwXt007ANZHQ0hQSW8qTIo55kx4Vwp1EFgcA7UmObgt8djFrZtA1I9u7PkALrAG5JXAJycjauOMFls3XmtM6iPOt5vvowiYFoJnUevTMgxzGVwfixqrcT+ji7XJVI5x/cYK590mkD940U/Q4zET0oTip7inZ1os97FJDjq6sF38nIw3uNRUnCDzUg/n89aZZJIXtiMBh512mpbN15qfz6+VMhiKb2vqgdnoE5rhpkTGlCUU3tIsHazkprePo07NNJwyFhsXMj5PLxOVG/wCyi1gjtvX2B2Vse4sraH+zhjU+0KNXzzWTNUtF8Wik3nYm4CkkKx6BTk49hxVULCMlWBB5EEEEHyIPKt0LVA9p+zkd2uSAsq+i/n/dfzX8PkcksXoVdsypXBoiW2QplRvQfEh3TMmMMpIYdQRsae4VLqX11LxYseBiOEZ8VJu1UnaneKzEY6GgQ5xnnmnh6hWmV65szjONjy2OD7KgryHBxjHqxU03F1SbVIrt6BOlwmdOdxlTvsPfmlcV4yk40x25U455ZjzHNicdPLNe3JQfBm7O23ZVNG9StnZIRuOfXPL2UNbWrSOFQFj6gT+FW7hnZC4b0gE9XNvgNh8aiobOlKiuWtigw27YPInYHO3SpzhXDZrhgsalstnyAA6k9BVy4P2FjXBkJPq5n/QVc7K0SJdKKFHq6+snrU554w1ErDp5T3LSIPs92VS3CvJiSUDY48KH+6DzP94+7FTVxdBRmuXl4FFUjtH2hC53rDPJKb2ejixRgjvaHjuM70L2D7N/7QkaWcOLdMY5jvm32Dc9IxvjzAzzq19iuycZjW4uYw8j4YK4yI1O6jSdtWNyenL23qFAOQx5CmhChck70gXhnC4YCe5iSMEAYRVXZc4zgb8zS+NcNS5iMMhYKxGdJ0nCkHGemcY23o0CnAKqSsYXCIABgAYAHQDYCoWynUSzTtnTCuPCCzH7xCqNyeVS9/stM9nYMAn9ZifnTw5J5H7vzKDxXjr3soAAwCQio6+FebGTWGTYDJbSCOWeVQzx/aaYJvEXCISrxM2o6VClS25JHPTz6VsnFLOCRWEkatqADbYJAIYeIb7EA+0VAQ8GtY21aSxwwzI7yEKwwyguTgYJHngkdar7RIzLDJmZcRSRbeT6wglHjCIuWCk6O8llltTnxKFUB2w2CTgKNUfdLHLYscG3QsoLAC5E7K3pBlK6EjGkZ8SgyEbuWq8cc7OlWN3w+H7RRpRFIUI+CDMAxAJAIAXlk53xg0V47uSQR3ceVRTqkuo2xDEDqZu9GHwCdgrbkgDc0edgaadBN33j2SrbsLlQ8ZLSCN0jbxKsSR3IDZ0BiXRSznqAu7PG+7ggS3eFo3nfJjjIVzG66Yy6yq++S5VUKaBLj0mbAnGOM2twO6CSwwq2U9CbVuSZJA2lw7DAOHOyqOlGz3eYI7eyuEZdSswcohZiNLAwTjDKqhQArHUQzNkkYFHWckTuLRFtpxC1zkfaGSJisbKY1TTrXuyzS5LMuts48K4KeL28gs0a4h+sucBSobQkcTMGVntT3feZdjpYnSBk7uQHe1roiQm6iJmZkJ0SGIRqI1EICaTAzBRuQoA1BN9LGm+PRq0dtKs31VDqEKOJgwQEa3aeEsCJG1NrKgtueWKAQfiBV7KOTU9tFqChApmD+LU0xkUqyKXVRnHNFVdko6SWZY4WtTHNpk0tcPpeQO6q7xxiY98ulTpCgEgAtnU2ye00dw6xaIFvYlXuzcGMSmY7MSHiPeIoLkBNtIxzzsL2sSEi2tZA8TqpDJG0cqQzMxLK4ciTXhl1sXxkYGQuxOCI7pLCS3AjlSfVqMUUzKE1eONW1AlwAULAMFYll2wcz/De2N1F3Bnu4pUlOftotMrJqOnT3Y21AHSS+MFSQOsDxh2WCGGG4T7QCbDNGhcyNoJMEvh0aVXQA/i9LfVmhu0g0JDJcRd5M7BiwZ0VVYBIwuFaEt4cnbYFV3wTQONB4R24aUqs1jLH3jYDROs0YXIUsxIC4G+cMcaTtTa/7EvT4Wg1O2kHDWzuwIGA406zuvU8xWfcZhTEVx35hjU6Iojrxoj21CRQWKl9fiKZJ1ncb0bdvOjwvDFHMkTKrXBjWR2cATMSv6UHLjSpGVCoeprji38Q+iiM5MM8kfqdVlQY6ZXSfPmxqpcV+i+9TJVIpx07tgrn3Ppx7mNDScYSwniiH1qOTKyTJDJyd21iPxDUzFCoYFyNTEDlVl4D9IV9NOIY3gneSQ4jmjaBkTclRpG+kAnJY7DkaNgopHD/AKPrqefuO5eFsFi0quqADH3seI5IGxPOvcU+i7iMP9SJR5xMH/hOG+VfS4TPTFKEFB0ds+Tuz3BJGv7e3kjZWeaMMrqVbTqGo6WGeQPwr6y3BwaGv+HxFo3ZFMkZJRyBqTI0tpPMZBxRpORUZ7ZaGkeoeWYA0uSTFR9y9IyiM87cW4Fy0gHpHDftLjBP+Fk+FViKYxyZ23+FaPJbLNezwNyaGOVf4oz/AJRVD4vZrbSsJN8Hw+ys9MMl6CeIuHIJPuoYzjqf5VHm+R2znHlQz2rOSRyoqHqS2QkznTkDVjpz2PlVg7P8CklADgqnPSNs7dW/0qvWc2GFX/hPFdSjpitkM7xopLp1keyw8L4NFEuFUAeSjGfb51JhceoVFQcR2FNz8VFZsmac+WasXTwh/iieEumgL/i4GwNV6541kdarfFuMVJJss6W2SnHe0OM4NRfYzhT310JHRjBF4zsdLsD4UzyIzufUPXT3ZTsk18e9lfRCG5DdnxzUeQ9da9a8BhXSAuyjC7nCjyVRsPcKtFKJCcnJ/AkrUHTvRaUMtvoHgOPUSSD8eVOQy6hnGCNiPI/zp0TY+TXg9NO1M66IKHbpQwweVetyFGByHShnkqN4vxlIIzJISFG2wJJJ5AUUzu2yZuroBSSQABuTsAPMmqg9+bhisB1LneT7o/Y/XPy9vKo2K3m4g+qY6YAcrCDsccjJj0j8h086uXD+HrGAFGAPKqKN7ZOWTt0j3B4GiQKWLY6nnRcrKwIYBgdiCMg1x/KuAVQysr3EewHD58nuRGx+9EdG/mQPCfeKqXFfoefc21yG/uyjB9mtf+2tRC13Ua62GjBbns1xWyBAil0D+yPexnzzGMg/4lqNuu0Zlb+lQiRlK7o7wOGQaVJC5jyAAB9nX0kkx60BxLhFrcjE0EcnrZQSPY3Me6usFGKSXUN88EMBMLKypDGyyagW9MLcRFt3bLs7Rg5O5wKM4y8x7uGNIr1IsCSciO4LO28noapFjXOhdgfCTvq20EfRxaoJTal4JJEMYfLP3at6egMcgsMrnOQCcYqiz/RBeJKgWaIpqGZBqV4xndgmDuB0Dbny512jtkZ2mlt++iacTLdt4iiEHuVkOYU7t86ZArBtOoBcqBywHeMQS5imt7lIrZcpHE8hjJSN8MXJOh9TE5bX4iWx6mOOcVmkuNOEZItMaW0oSSUIngQvMyMO8bAYsH2JxyFXmXsPa3wQNOUubdUjkjiU9wjxqBoVHHoDceFt8k9a44o3aydg0Qe2WcRqim6wyI7Df7OVCE0KWCjPRCTnVsP2nlhEdtCzyW7d2JHiCiQRmRjIDK+VbW4KORpOnwDGwqw9sez1zDLBa2tyAVjMoRXmjlmkY4klZsaOiqoL7KoFU6/uLjvu6u4IppWYA94FEhJwo+2hZST0yzGuOJee7ZraOG0eO4w2ty+l2Uk6RGsc4D6VRF3VfEWY7bVpX0X9nyAbueHu5TqSMEy5EO2SUkPgLMCcADw42oLs99GdsiK9xGS2MmLWGROpUuqq0g35MSPbWj2GAAo2UDYeQGwA9WKRzXBT2bqwsCnFWvAUi4fkvVs/Ac6Vs5IHkOct8PZXIz4RSpORpi2PhHvqZQRdPiop7jnRHEpcfn11Te0nGu4id+uCF9bP4V92WFJJjxRNWds81zG8RAItirsdwoLxlMjqfDLj2GpXiHYS2nOqdpHPqbQP4Rn50/2IsylqjP6bgMepwR4AT6lx7yasDGnhHVsSct6Klb/Rnwtf/wBck/3pZj/11KQdkLBBhbaPHsJ/E1L0oU9IQ//Z"
    }
  ];
  
  // Footer quick links
  const quickLinks = [
    { name: "About Us", url: "/about" },
    { name: "Courses", url: "/courses" },
    { name: "Instructors", url: "/instructors" },
    { name: "Contact", url: "/contact" },
    { name: "Privacy Policy", url: "/privacy" },
    { name: "Terms of Service", url: "/terms" }
  ];
  
  useEffect(() => {
    // Fetch stats for user count and lecture count
    const fetchStats = async () => {
      try {
        setLoading(true);
        const response = await axios.get('http://127.0.0.1:5000/stats', {
          // Adding these headers to handle CORS issues
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          // Adding a timeout to prevent hanging requests
          timeout: 5000
        });
        
        setStats({
          userCount: response.data.userCount,
          lectureCount: response.data.lectureCount
        });
        setError(null);
      } catch (err) {
        console.error("Error fetching stats:", err);
        setError("Failed to load stats. Please check server connection.");
        // Fallback to demo values if server is not available
        setStats({
          userCount: 150,
          lectureCount: 25
        });
      } finally {
        setLoading(false);
      }
    };
    
    fetchStats();
    
    // Set up periodic refresh of stats
    const statsInterval = setInterval(fetchStats, 60000); // Refresh every minute
    
    return () => clearInterval(statsInterval);
  }, []);

  // Image slider effect
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentImageIndex(prevIndex => 
         prevIndex === images.length - 1 ? 0 : prevIndex + 1
      );
    }, 5000); // Change image every 5 seconds
    
    return () => clearInterval(interval);
  }, [images.length]);

  const goToNextImage = () => {
    setCurrentImageIndex(prevIndex =>
      prevIndex === images.length - 1 ? 0 : prevIndex + 1
    );
  };

  const goToPrevImage = () => {
    setCurrentImageIndex(prevIndex =>
      prevIndex === 0 ? images.length - 1 : prevIndex - 1
    );
  };

  const getCurrentYear = () => {
    return new Date().getFullYear();
  };

  return (
    <div className="home-container">
      {/* Hero Section with Full Image Display */}
      <div className="hero-section">
        <div className="image-container">
          <img 
            src={images[currentImageIndex]} 
            alt="Education platform" 
            className="hero-image"
          />
        </div>
        
        <div className="hero-content">
          <div className="slider-controls">
            <button onClick={goToPrevImage} className="slider-btn prev-btn">&#10094;</button>
            <button onClick={goToNextImage} className="slider-btn next-btn">&#10095;</button>
          </div>
          
          <div className="slider-dots">
            {images.map((_, index) => (
              <span
                key={index}
                className={`dot ${index === currentImageIndex ? 'active' : ''}`}
                onClick={() => setCurrentImageIndex(index)}
              ></span>
            ))}
          </div>
          
          <div className="stats-container">
            <div className="stat-box">
              <div className="stat-value">
                {loading ? 
                  <span className="loading-indicator">...</span> : 
                  stats.userCount
                }
              </div>
              <div className="stat-label">Registered Users</div>
            </div>
            <div className="stat-box">
              <div className="stat-value">
                {loading ? 
                  <span className="loading-indicator">...</span> : 
                  stats.lectureCount
                }
              </div>
              <div className="stat-label">Available Lectures</div>
            </div>
          </div>
          
          {error && (
            <div className="error-message stats-error">
              {error}
            </div>
          )}
        </div>
      </div>
      
      {/* About Section - Now separate from the hero section */}
      <section className="about-section">
        <h2 className="section-title">About Our Platform</h2>
        <div className="about-content">
          {aboutContent.map((item, index) => (
            <div key={index} className="about-card">
              <div className="about-image">
                <img src={item.image} alt={item.title} />
              </div>
              <div className="about-text">
                <h3>{item.title}</h3>
                <p>{item.description}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="about-cta">
  <p>Ready to begin your learning journey?</p>
  <button 
    className="cta-button" 
    onClick={() => window.location.href = '/register'}
  >
    Get Started Today
  </button>
</div>
      </section>
      
      {/* Footer Section */}
      <footer className="footer">
        <div className="footer-content">
          <div className="footer-logo-section">
            <h3 className="footer-logo">EduPlatform</h3>
            <p className="footer-tagline">Empowering minds through quality education</p>
            <div className="social-links">
              <a href="https://facebook.com" className="social-icon" aria-label="Facebook">
                <i className="fab fa-facebook-f"></i>
              </a>
              <a href="https://twitter.com" className="social-icon" aria-label="Twitter">
                <i className="fab fa-twitter"></i>
              </a>
              <a href="https://instagram.com" className="social-icon" aria-label="Instagram">
                <i className="fab fa-instagram"></i>
              </a>
              <a href="https://linkedin.com" className="social-icon" aria-label="LinkedIn">
                <i className="fab fa-linkedin-in"></i>
              </a>
            </div>
          </div>
          
          <div className="footer-links">
            <div className="footer-links-column">
              <h4>Quick Links</h4>
              <ul>
                {quickLinks.slice(0, 3).map((link, index) => (
                  <li key={index}>
                    <a href={link.url}>{link.name}</a>
                  </li>
                ))}
              </ul>
            </div>
            
            <div className="footer-links-column">
              <h4>Resources</h4>
              <ul>
                {quickLinks.slice(3).map((link, index) => (
                  <li key={index}>
                    <a href={link.url}>{link.name}</a>
                  </li>
                ))}
              </ul>
            </div>
            
            <div className="footer-contact">
              <h4>Contact Us</h4>
              <address>
                <p><i className="fas fa-map-marker-alt"></i> kakinada , Learning City</p>
                <p><i className="fas fa-phone"></i> +19 9833324922</p>
                <p><i className="fas fa-envelope"></i> info@classlog.com</p>
              </address>
              
            </div>
          </div>
        </div>
        
        <div className="footer-bottom">
          <p>&copy; {getCurrentYear()} ClassLog. All rights reserved.</p>
          <p className="footer-credits">Made with <span className="heart">❤</span> for educators and learners worldwide</p>
        </div>
      </footer>
    </div>
  );
}

export default Home;